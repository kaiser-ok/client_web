"""
Graphiti Knowledge Graph Service
用於儲存和查詢 Slack、LINE、Email 訊息
+ CRM 結構化節點 CRUD（Phase 1）
"""

import os
import logging
from datetime import datetime
from typing import Optional, List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from graphiti_core import Graphiti
from graphiti_core.nodes import EpisodeType
from neo4j import AsyncGraphDatabase

load_dotenv()

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "graphiti123")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Graphiti client (for episodes)
graphiti_client: Optional[Graphiti] = None

# Direct Neo4j driver (for CRM structured nodes)
neo4j_driver = None


# ============================================
# Pydantic Models — Episode (existing)
# ============================================

class MessageInput(BaseModel):
    """訊息輸入格式"""
    platform: str = Field(..., description="SLACK | LINE | EMAIL")
    external_id: str = Field(..., description="原始平台訊息 ID")
    content: str = Field(..., description="訊息內容")
    timestamp: datetime = Field(default_factory=datetime.now)
    sender_id: Optional[str] = None
    sender_name: Optional[str] = None
    sender_email: Optional[str] = None
    channel_id: Optional[str] = None
    channel_name: Optional[str] = None
    thread_id: Optional[str] = None
    reply_to_id: Optional[str] = None
    subject: Optional[str] = None  # Email 主旨
    partner_id: Optional[str] = None  # CRM Partner ID
    metadata: Optional[dict] = None


class BulkMessageInput(BaseModel):
    """批量訊息輸入"""
    messages: List[MessageInput]


class SearchQuery(BaseModel):
    """搜尋查詢"""
    query: str
    partner_id: Optional[str] = None
    platforms: Optional[List[str]] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    limit: int = 20


class AskQuery(BaseModel):
    """RAG 問答查詢"""
    question: str
    partner_id: Optional[str] = None
    context_messages: Optional[int] = 10


class IngestResponse(BaseModel):
    """訊息寫入回應"""
    success: bool
    episode_id: Optional[str] = None
    message: str


class SearchResult(BaseModel):
    """搜尋結果"""
    content: str
    platform: str
    timestamp: datetime
    sender: Optional[str] = None
    relevance_score: float


class AskResponse(BaseModel):
    """問答回應"""
    answer: str
    sources: List[dict]


# ============================================
# Pydantic Models — CRM Nodes (Phase 1)
# ============================================

class OrganizationNode(BaseModel):
    crm_id: str
    name: str
    aliases: Optional[List[str]] = None
    contact: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    jira_label: Optional[str] = None
    odoo_id: Optional[int] = None
    source: Optional[str] = "MANUAL"
    is_active: Optional[bool] = True
    parent_crm_id: Optional[str] = None


class PersonNode(BaseModel):
    crm_id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    title: Optional[str] = None
    line_user_id: Optional[str] = None
    slack_user_id: Optional[str] = None
    organization_crm_id: Optional[str] = None


class DealNode(BaseModel):
    crm_id: str
    name: str
    organization_crm_id: str
    project_name: Optional[str] = None
    type: Optional[str] = "PURCHASE"
    amount: Optional[float] = None
    sales_rep: Optional[str] = None
    closed_at: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    source: Optional[str] = "MANUAL"
    odoo_id: Optional[int] = None


class IssueNode(BaseModel):
    crm_id: str
    jira_key: str
    summary: str
    organization_crm_id: str
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee: Optional[str] = None
    waiting_on: Optional[str] = None


class ProductNode(BaseModel):
    crm_id: str
    name: str
    sku: Optional[str] = None
    category: Optional[str] = None


class ProjectNode(BaseModel):
    crm_id: str
    name: str
    organization_crm_id: str
    deal_crm_id: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = "ACTIVE"
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class RelationshipInput(BaseModel):
    from_label: str
    from_crm_id: str
    to_label: str
    to_crm_id: str
    rel_type: str
    properties: Optional[dict] = None


# Allowed relationship types
ALLOWED_RELATIONSHIPS = {
    "PARENT_OF", "HAS_DEAL", "HAS_ISSUE", "HAS_PROJECT",
    "BELONGS_TO", "USES_PRODUCT", "RELATED_TO", "AFFECTS_PRODUCT",
}


# ============================================
# CRM Schema Setup
# ============================================

async def _create_crm_schema(driver):
    """Create constraints and indexes for CRM nodes"""
    constraints = [
        "CREATE CONSTRAINT crm_organization_id IF NOT EXISTS FOR (n:Organization) REQUIRE n.crm_id IS UNIQUE",
        "CREATE CONSTRAINT crm_person_id IF NOT EXISTS FOR (n:Person) REQUIRE n.crm_id IS UNIQUE",
        "CREATE CONSTRAINT crm_deal_id IF NOT EXISTS FOR (n:Deal) REQUIRE n.crm_id IS UNIQUE",
        "CREATE CONSTRAINT crm_issue_id IF NOT EXISTS FOR (n:Issue) REQUIRE n.crm_id IS UNIQUE",
        "CREATE CONSTRAINT crm_issue_jira_key IF NOT EXISTS FOR (n:Issue) REQUIRE n.jira_key IS UNIQUE",
        "CREATE CONSTRAINT crm_product_id IF NOT EXISTS FOR (n:Product) REQUIRE n.crm_id IS UNIQUE",
        "CREATE CONSTRAINT crm_project_id IF NOT EXISTS FOR (n:Project) REQUIRE n.crm_id IS UNIQUE",
    ]
    indexes = [
        "CREATE INDEX crm_org_name IF NOT EXISTS FOR (n:Organization) ON (n.name)",
        "CREATE INDEX crm_person_email IF NOT EXISTS FOR (n:Person) ON (n.email)",
        "CREATE INDEX crm_deal_org IF NOT EXISTS FOR (n:Deal) ON (n.organization_crm_id)",
        "CREATE INDEX crm_issue_status IF NOT EXISTS FOR (n:Issue) ON (n.status)",
        "CREATE INDEX crm_issue_org IF NOT EXISTS FOR (n:Issue) ON (n.organization_crm_id)",
        "CREATE INDEX crm_project_org IF NOT EXISTS FOR (n:Project) ON (n.organization_crm_id)",
    ]
    async with driver.session() as session:
        for stmt in constraints + indexes:
            try:
                await session.run(stmt)
            except Exception as e:
                logger.warning(f"Schema statement skipped: {e}")
    logger.info("CRM schema constraints and indexes created")


# ============================================
# Lifespan
# ============================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """應用程式生命週期管理"""
    global graphiti_client, neo4j_driver

    logger.info("Initializing Graphiti client...")
    try:
        graphiti_client = Graphiti(
            uri=NEO4J_URI,
            user=NEO4J_USER,
            password=NEO4J_PASSWORD,
        )
        # 建立索引
        await graphiti_client.build_indices_and_constraints()
        logger.info("Graphiti client initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Graphiti: {e}")
        raise

    # Initialize direct Neo4j driver for CRM nodes
    logger.info("Initializing Neo4j driver for CRM nodes...")
    try:
        neo4j_driver = AsyncGraphDatabase.driver(
            NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD)
        )
        await _create_crm_schema(neo4j_driver)
        logger.info("Neo4j CRM driver initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Neo4j CRM driver: {e}")
        raise

    yield

    # Cleanup
    if graphiti_client:
        await graphiti_client.close()
        logger.info("Graphiti client closed")
    if neo4j_driver:
        await neo4j_driver.close()
        logger.info("Neo4j CRM driver closed")


app = FastAPI(
    title="Graphiti Knowledge Graph Service",
    description="儲存和查詢 Slack、LINE、Email 訊息的知識圖譜服務 + CRM 結構化節點",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://proj.gentrice.net:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================
# Existing Episode Endpoints (unchanged)
# ============================================

@app.get("/health")
async def health_check():
    """健康檢查"""
    return {
        "status": "healthy",
        "neo4j_connected": graphiti_client is not None,
        "crm_driver_connected": neo4j_driver is not None,
        "timestamp": datetime.now().isoformat(),
    }


@app.post("/messages", response_model=IngestResponse)
async def ingest_message(message: MessageInput):
    """
    寫入單一訊息到知識圖譜
    """
    if not graphiti_client:
        raise HTTPException(status_code=503, detail="Graphiti client not initialized")

    try:
        # 構建訊息描述
        source_info = f"[{message.platform}]"
        if message.channel_name:
            source_info += f" #{message.channel_name}"
        if message.sender_name:
            source_info += f" from {message.sender_name}"
        if message.sender_email:
            source_info += f" <{message.sender_email}>"

        episode_body = f"{source_info}\n"
        if message.subject:
            episode_body += f"Subject: {message.subject}\n"
        episode_body += f"\n{message.content}"

        # 添加 episode
        result = await graphiti_client.add_episode(
            name=f"{message.platform}_{message.external_id}",
            episode_body=episode_body,
            reference_time=message.timestamp,
            source_description=f"{message.platform} message",
            source=EpisodeType.message,
        )

        logger.info(f"Ingested message: {message.platform}_{message.external_id}")

        return IngestResponse(
            success=True,
            episode_id=str(result.episode.uuid) if result and result.episode else None,
            message="Message ingested successfully",
        )
    except Exception as e:
        logger.error(f"Error ingesting message: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/messages/bulk", response_model=IngestResponse)
async def bulk_ingest_messages(bulk: BulkMessageInput):
    """
    批量寫入訊息到知識圖譜
    """
    if not graphiti_client:
        raise HTTPException(status_code=503, detail="Graphiti client not initialized")

    try:
        success_count = 0
        for message in bulk.messages:
            try:
                source_info = f"[{message.platform}]"
                if message.channel_name:
                    source_info += f" #{message.channel_name}"
                if message.sender_name:
                    source_info += f" from {message.sender_name}"

                episode_body = f"{source_info}\n"
                if message.subject:
                    episode_body += f"Subject: {message.subject}\n"
                episode_body += f"\n{message.content}"

                await graphiti_client.add_episode(
                    name=f"{message.platform}_{message.external_id}",
                    episode_body=episode_body,
                    reference_time=message.timestamp,
                    source_description=f"{message.platform} message",
                    source=EpisodeType.message,
                )
                success_count += 1
            except Exception as e:
                logger.warning(f"Failed to ingest message {message.external_id}: {e}")

        return IngestResponse(
            success=True,
            message=f"Ingested {success_count}/{len(bulk.messages)} messages",
        )
    except Exception as e:
        logger.error(f"Error in bulk ingest: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search", response_model=List[SearchResult])
async def search_messages(query: SearchQuery):
    """
    搜尋訊息
    使用向量相似度 + 圖形關係進行搜尋
    """
    if not graphiti_client:
        raise HTTPException(status_code=503, detail="Graphiti client not initialized")

    try:
        # 使用 Graphiti 的搜尋功能
        results = await graphiti_client.search(
            query=query.query,
            num_results=query.limit,
        )

        search_results = []
        for edge in results:
            # 從 edge 中提取資訊
            search_results.append(SearchResult(
                content=edge.fact if hasattr(edge, 'fact') else str(edge),
                platform="UNKNOWN",  # 需要從 metadata 解析
                timestamp=edge.created_at if hasattr(edge, 'created_at') else datetime.now(),
                sender=None,
                relevance_score=edge.score if hasattr(edge, 'score') else 0.0,
            ))

        return search_results
    except Exception as e:
        logger.error(f"Error searching: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ask", response_model=AskResponse)
async def ask_question(query: AskQuery):
    """
    RAG 問答
    基於知識圖譜回答問題
    """
    if not graphiti_client:
        raise HTTPException(status_code=503, detail="Graphiti client not initialized")

    try:
        # 搜尋相關內容
        results = await graphiti_client.search(
            query=query.question,
            num_results=query.context_messages or 10,
        )

        # 檢查是否有找到相關資料
        if not results or len(results) == 0:
            logger.info(f"No results found for question: {query.question}")
            return AskResponse(
                answer="抱歉，在知識圖譜中找不到與您問題相關的資料。\n\n可能的原因：\n1. 尚未同步相關的訊息資料\n2. 問題的關鍵字與現有資料不匹配\n\n建議：\n- 嘗試使用不同的關鍵字\n- 確認是否已將 Slack/LINE/Email 訊息同步到系統",
                sources=[],
            )

        # 構建上下文
        context_parts = []
        sources = []
        for i, edge in enumerate(results):
            fact = edge.fact if hasattr(edge, 'fact') else str(edge)
            context_parts.append(f"{i+1}. {fact}")
            sources.append({
                "index": i + 1,
                "content": fact[:200],
                "score": edge.score if hasattr(edge, 'score') else 0.0,
            })

        context = "\n".join(context_parts)

        # 使用 OpenAI 生成回答
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=OPENAI_API_KEY)

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": """你是一個客戶服務助手。你的任務是**嚴格根據提供的訊息記錄**回答問題。

重要規則：
1. **絕對禁止編造**：只能使用下方「相關訊息記錄」中的資訊
2. **資訊不足時必須說明**：如果記錄中沒有足夠資訊回答問題，請明確說「根據現有記錄無法回答此問題」
3. **必須引用來源**：回答時請引用訊息編號（例如：根據記錄 1...）
4. **使用繁體中文回答**
5. **不要使用你自己的知識**：即使你知道答案，如果記錄中沒有，也要說「記錄中未提及」"""
                },
                {
                    "role": "user",
                    "content": f"""相關訊息記錄：
{context}

問題：{query.question}

請嚴格根據上述記錄回答，如果記錄中沒有相關資訊，請直接說明「根據現有記錄無法回答」。"""
                }
            ],
            temperature=0.2,
        )

        answer = response.choices[0].message.content

        return AskResponse(
            answer=answer,
            sources=sources,
        )
    except Exception as e:
        logger.error(f"Error in ask: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/partner/{partner_id}/messages")
async def get_partner_messages(
    partner_id: str,
    limit: int = 50,
    platforms: Optional[str] = None,
):
    """
    取得特定客戶的所有訊息
    """
    if not graphiti_client:
        raise HTTPException(status_code=503, detail="Graphiti client not initialized")

    try:
        # 搜尋與客戶相關的訊息
        results = await graphiti_client.search(
            query=f"partner:{partner_id}",
            num_results=limit,
        )

        messages = []
        for edge in results:
            messages.append({
                "content": edge.fact if hasattr(edge, 'fact') else str(edge),
                "created_at": edge.created_at.isoformat() if hasattr(edge, 'created_at') else None,
            })

        return {
            "partner_id": partner_id,
            "count": len(messages),
            "messages": messages,
        }
    except Exception as e:
        logger.error(f"Error getting partner messages: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/clear")
async def clear_graph():
    """
    清空知識圖譜（危險操作，僅供開發測試）
    """
    if not graphiti_client:
        raise HTTPException(status_code=503, detail="Graphiti client not initialized")

    try:
        # 執行清空操作
        driver = graphiti_client.driver
        async with driver.session() as session:
            await session.run("MATCH (n) DETACH DELETE n")

        # 重建索引
        await graphiti_client.build_indices_and_constraints()

        return {"success": True, "message": "Graph cleared successfully"}
    except Exception as e:
        logger.error(f"Error clearing graph: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# CRM Node CRUD Endpoints (Phase 1)
# ============================================

def _require_crm_driver():
    if not neo4j_driver:
        raise HTTPException(status_code=503, detail="Neo4j CRM driver not initialized")


@app.post("/nodes/organization")
async def upsert_organization(node: OrganizationNode):
    """MERGE Organization node by crm_id, optionally create PARENT_OF relationship"""
    _require_crm_driver()
    try:
        async with neo4j_driver.session() as session:
            result = await session.run(
                """
                MERGE (o:Organization {crm_id: $crm_id})
                SET o.name = $name,
                    o.aliases = $aliases,
                    o.contact = $contact,
                    o.phone = $phone,
                    o.email = $email,
                    o.website = $website,
                    o.jira_label = $jira_label,
                    o.odoo_id = $odoo_id,
                    o.source = $source,
                    o.is_active = $is_active,
                    o.updated_at = datetime()
                RETURN o.crm_id AS crm_id
                """,
                crm_id=node.crm_id,
                name=node.name,
                aliases=node.aliases or [],
                contact=node.contact,
                phone=node.phone,
                email=node.email,
                website=node.website,
                jira_label=node.jira_label,
                odoo_id=node.odoo_id,
                source=node.source,
                is_active=node.is_active,
            )
            record = await result.single()

            # Handle parent relationship
            if node.parent_crm_id:
                await session.run(
                    """
                    MATCH (parent:Organization {crm_id: $parent_crm_id})
                    MATCH (child:Organization {crm_id: $child_crm_id})
                    MERGE (parent)-[:PARENT_OF]->(child)
                    """,
                    parent_crm_id=node.parent_crm_id,
                    child_crm_id=node.crm_id,
                )

        return {"success": True, "crm_id": record["crm_id"]}
    except Exception as e:
        logger.error(f"Error upserting organization: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/nodes/person")
async def upsert_person(node: PersonNode):
    """MERGE Person node by crm_id, optionally create BELONGS_TO relationship"""
    _require_crm_driver()
    try:
        async with neo4j_driver.session() as session:
            result = await session.run(
                """
                MERGE (p:Person {crm_id: $crm_id})
                SET p.name = $name,
                    p.email = $email,
                    p.phone = $phone,
                    p.title = $title,
                    p.line_user_id = $line_user_id,
                    p.slack_user_id = $slack_user_id,
                    p.updated_at = datetime()
                RETURN p.crm_id AS crm_id
                """,
                crm_id=node.crm_id,
                name=node.name,
                email=node.email,
                phone=node.phone,
                title=node.title,
                line_user_id=node.line_user_id,
                slack_user_id=node.slack_user_id,
            )
            record = await result.single()

            # Handle BELONGS_TO relationship
            if node.organization_crm_id:
                await session.run(
                    """
                    MATCH (p:Person {crm_id: $person_crm_id})
                    MATCH (o:Organization {crm_id: $org_crm_id})
                    MERGE (p)-[:BELONGS_TO]->(o)
                    """,
                    person_crm_id=node.crm_id,
                    org_crm_id=node.organization_crm_id,
                )

        return {"success": True, "crm_id": record["crm_id"]}
    except Exception as e:
        logger.error(f"Error upserting person: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/nodes/deal")
async def upsert_deal(node: DealNode):
    """MERGE Deal node by crm_id + auto-create HAS_DEAL from org"""
    _require_crm_driver()
    try:
        async with neo4j_driver.session() as session:
            result = await session.run(
                """
                MERGE (d:Deal {crm_id: $crm_id})
                SET d.name = $name,
                    d.organization_crm_id = $organization_crm_id,
                    d.project_name = $project_name,
                    d.type = $type,
                    d.amount = $amount,
                    d.sales_rep = $sales_rep,
                    d.closed_at = $closed_at,
                    d.start_date = $start_date,
                    d.end_date = $end_date,
                    d.source = $source,
                    d.odoo_id = $odoo_id,
                    d.updated_at = datetime()
                RETURN d.crm_id AS crm_id
                """,
                crm_id=node.crm_id,
                name=node.name,
                organization_crm_id=node.organization_crm_id,
                project_name=node.project_name,
                type=node.type,
                amount=node.amount,
                sales_rep=node.sales_rep,
                closed_at=node.closed_at,
                start_date=node.start_date,
                end_date=node.end_date,
                source=node.source,
                odoo_id=node.odoo_id,
            )
            record = await result.single()

            # Auto-create HAS_DEAL relationship
            await session.run(
                """
                MATCH (o:Organization {crm_id: $org_crm_id})
                MATCH (d:Deal {crm_id: $deal_crm_id})
                MERGE (o)-[:HAS_DEAL]->(d)
                """,
                org_crm_id=node.organization_crm_id,
                deal_crm_id=node.crm_id,
            )

        return {"success": True, "crm_id": record["crm_id"]}
    except Exception as e:
        logger.error(f"Error upserting deal: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/nodes/issue")
async def upsert_issue(node: IssueNode):
    """MERGE Issue node by crm_id + auto-create HAS_ISSUE from org"""
    _require_crm_driver()
    try:
        async with neo4j_driver.session() as session:
            result = await session.run(
                """
                MERGE (i:Issue {crm_id: $crm_id})
                SET i.jira_key = $jira_key,
                    i.summary = $summary,
                    i.organization_crm_id = $organization_crm_id,
                    i.status = $status,
                    i.priority = $priority,
                    i.assignee = $assignee,
                    i.waiting_on = $waiting_on,
                    i.updated_at = datetime()
                RETURN i.crm_id AS crm_id
                """,
                crm_id=node.crm_id,
                jira_key=node.jira_key,
                summary=node.summary,
                organization_crm_id=node.organization_crm_id,
                status=node.status,
                priority=node.priority,
                assignee=node.assignee,
                waiting_on=node.waiting_on,
            )
            record = await result.single()

            # Auto-create HAS_ISSUE relationship
            await session.run(
                """
                MATCH (o:Organization {crm_id: $org_crm_id})
                MATCH (i:Issue {crm_id: $issue_crm_id})
                MERGE (o)-[:HAS_ISSUE]->(i)
                """,
                org_crm_id=node.organization_crm_id,
                issue_crm_id=node.crm_id,
            )

        return {"success": True, "crm_id": record["crm_id"]}
    except Exception as e:
        logger.error(f"Error upserting issue: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/nodes/product")
async def upsert_product(node: ProductNode):
    """MERGE Product node by crm_id"""
    _require_crm_driver()
    try:
        async with neo4j_driver.session() as session:
            result = await session.run(
                """
                MERGE (p:Product {crm_id: $crm_id})
                SET p.name = $name,
                    p.sku = $sku,
                    p.category = $category,
                    p.updated_at = datetime()
                RETURN p.crm_id AS crm_id
                """,
                crm_id=node.crm_id,
                name=node.name,
                sku=node.sku,
                category=node.category,
            )
            record = await result.single()

        return {"success": True, "crm_id": record["crm_id"]}
    except Exception as e:
        logger.error(f"Error upserting product: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/nodes/project")
async def upsert_project(node: ProjectNode):
    """MERGE Project node by crm_id + HAS_PROJECT from org and deal"""
    _require_crm_driver()
    try:
        async with neo4j_driver.session() as session:
            result = await session.run(
                """
                MERGE (p:Project {crm_id: $crm_id})
                SET p.name = $name,
                    p.organization_crm_id = $organization_crm_id,
                    p.type = $type,
                    p.status = $status,
                    p.start_date = $start_date,
                    p.end_date = $end_date,
                    p.updated_at = datetime()
                RETURN p.crm_id AS crm_id
                """,
                crm_id=node.crm_id,
                name=node.name,
                organization_crm_id=node.organization_crm_id,
                type=node.type,
                status=node.status,
                start_date=node.start_date,
                end_date=node.end_date,
            )
            record = await result.single()

            # HAS_PROJECT from organization
            await session.run(
                """
                MATCH (o:Organization {crm_id: $org_crm_id})
                MATCH (p:Project {crm_id: $proj_crm_id})
                MERGE (o)-[:HAS_PROJECT]->(p)
                """,
                org_crm_id=node.organization_crm_id,
                proj_crm_id=node.crm_id,
            )

            # HAS_PROJECT from deal (if provided)
            if node.deal_crm_id:
                await session.run(
                    """
                    MATCH (d:Deal {crm_id: $deal_crm_id})
                    MATCH (p:Project {crm_id: $proj_crm_id})
                    MERGE (d)-[:HAS_PROJECT]->(p)
                    """,
                    deal_crm_id=node.deal_crm_id,
                    proj_crm_id=node.crm_id,
                )

        return {"success": True, "crm_id": record["crm_id"]}
    except Exception as e:
        logger.error(f"Error upserting project: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/relationships")
async def create_relationship(rel: RelationshipInput):
    """Generic relationship creation with allowlist validation"""
    _require_crm_driver()

    if rel.rel_type not in ALLOWED_RELATIONSHIPS:
        raise HTTPException(
            status_code=400,
            detail=f"Relationship type '{rel.rel_type}' not allowed. Allowed: {sorted(ALLOWED_RELATIONSHIPS)}",
        )

    allowed_labels = {"Organization", "Person", "Deal", "Issue", "Product", "Project"}
    if rel.from_label not in allowed_labels or rel.to_label not in allowed_labels:
        raise HTTPException(
            status_code=400,
            detail=f"Labels must be one of: {sorted(allowed_labels)}",
        )

    try:
        props_clause = ""
        params = {
            "from_crm_id": rel.from_crm_id,
            "to_crm_id": rel.to_crm_id,
        }
        if rel.properties:
            props_clause = " SET r += $props"
            params["props"] = rel.properties

        query = f"""
            MATCH (a:{rel.from_label} {{crm_id: $from_crm_id}})
            MATCH (b:{rel.to_label} {{crm_id: $to_crm_id}})
            MERGE (a)-[r:{rel.rel_type}]->(b)
            {props_clause}
            RETURN type(r) AS rel_type
        """
        async with neo4j_driver.session() as session:
            result = await session.run(query, **params)
            record = await result.single()
            if not record:
                raise HTTPException(
                    status_code=404,
                    detail="One or both nodes not found",
                )

        return {"success": True, "rel_type": record["rel_type"]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating relationship: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# CRM Query Endpoints (Phase 1)
# ============================================

@app.get("/organizations/{crm_id}/360")
async def get_organization_360(crm_id: str):
    """Single Cypher traversal returning org + deals + issues + projects + contacts + parent + subsidiaries"""
    _require_crm_driver()
    try:
        async with neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (o:Organization {crm_id: $crm_id})
                OPTIONAL MATCH (o)-[:HAS_DEAL]->(d:Deal)
                OPTIONAL MATCH (o)-[:HAS_ISSUE]->(i:Issue)
                OPTIONAL MATCH (o)-[:HAS_PROJECT]->(p:Project)
                OPTIONAL MATCH (person:Person)-[:BELONGS_TO]->(o)
                OPTIONAL MATCH (parent:Organization)-[:PARENT_OF]->(o)
                OPTIONAL MATCH (o)-[:PARENT_OF]->(sub:Organization)
                RETURN o {.*, labels: labels(o)} AS organization,
                       collect(DISTINCT d {.*}) AS deals,
                       collect(DISTINCT i {.*}) AS issues,
                       collect(DISTINCT p {.*}) AS projects,
                       collect(DISTINCT person {.*}) AS contacts,
                       parent {.*} AS parent,
                       collect(DISTINCT sub {.*}) AS subsidiaries
                """,
                crm_id=crm_id,
            )
            record = await result.single()

            if not record or not record["organization"]:
                raise HTTPException(status_code=404, detail=f"Organization {crm_id} not found")

            return {
                "organization": dict(record["organization"]),
                "deals": [dict(d) for d in record["deals"] if d],
                "issues": [dict(i) for i in record["issues"] if i],
                "projects": [dict(p) for p in record["projects"] if p],
                "contacts": [dict(c) for c in record["contacts"] if c],
                "parent": dict(record["parent"]) if record["parent"] else None,
                "subsidiaries": [dict(s) for s in record["subsidiaries"] if s],
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting organization 360: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/organizations/{crm_id}/network")
async def get_organization_network(crm_id: str, depth: int = 2):
    """Subgraph traversal with configurable depth (capped at 3)"""
    _require_crm_driver()
    depth = min(depth, 3)
    try:
        async with neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (o:Organization {crm_id: $crm_id})
                CALL apoc.path.subgraphAll(o, {maxLevel: $depth}) YIELD nodes, relationships
                RETURN [n IN nodes | n {.*, _labels: labels(n), _id: id(n)}] AS nodes,
                       [r IN relationships | {
                           _id: id(r),
                           _type: type(r),
                           _start: id(startNode(r)),
                           _end: id(endNode(r)),
                           properties: properties(r)
                       }] AS relationships
                """,
                crm_id=crm_id,
                depth=depth,
            )
            record = await result.single()

            if not record:
                raise HTTPException(status_code=404, detail=f"Organization {crm_id} not found")

            return {
                "nodes": [dict(n) for n in record["nodes"]],
                "relationships": [dict(r) for r in record["relationships"]],
            }
    except HTTPException:
        raise
    except Exception as e:
        # Fallback if APOC is not installed
        if "apoc" in str(e).lower():
            logger.warning("APOC not available, falling back to basic traversal")
            try:
                async with neo4j_driver.session() as session:
                    result = await session.run(
                        """
                        MATCH path = (o:Organization {crm_id: $crm_id})-[*1..3]-(connected)
                        WITH collect(DISTINCT connected {.*, _labels: labels(connected)}) AS nodes,
                             collect(DISTINCT o {.*, _labels: labels(o)}) AS origin
                        RETURN origin + nodes AS nodes
                        """,
                        crm_id=crm_id,
                    )
                    record = await result.single()
                    return {
                        "nodes": [dict(n) for n in record["nodes"]] if record else [],
                        "relationships": [],
                        "note": "APOC not available, relationships not included",
                    }
            except Exception as fallback_e:
                logger.error(f"Fallback network query failed: {fallback_e}")
                raise HTTPException(status_code=500, detail=str(fallback_e))
        logger.error(f"Error getting organization network: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Graph Query Endpoints (Phase 3)
# ============================================

@app.get("/persons/{crm_id}/connections")
async def get_person_connections(crm_id: str):
    """Person cross-org connections: returns person with all organizations they belong to"""
    _require_crm_driver()
    try:
        async with neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (p:Person {crm_id: $crm_id})
                OPTIONAL MATCH (p)-[w:BELONGS_TO]->(org:Organization)
                RETURN p {.*} AS person,
                       collect(DISTINCT {
                           organization: org {.*},
                           role: p.title
                       }) AS organizations
                """,
                crm_id=crm_id,
            )
            record = await result.single()

            if not record or not record["person"]:
                raise HTTPException(status_code=404, detail=f"Person {crm_id} not found")

            return {
                "person": dict(record["person"]),
                "organizations": [
                    dict(o) for o in record["organizations"]
                    if o and o.get("organization")
                ],
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting person connections: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/products/{name}/impact")
async def get_product_impact(name: str):
    """Product impact analysis: returns product with customers and related issues"""
    _require_crm_driver()
    try:
        async with neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (prod:Product {name: $name})
                OPTIONAL MATCH (org:Organization)-[:USES_PRODUCT]->(prod)
                OPTIONAL MATCH (org)-[:HAS_DEAL]->(d:Deal)
                OPTIONAL MATCH (i:Issue)-[:AFFECTS_PRODUCT]->(prod)
                RETURN prod {.*} AS product,
                       collect(DISTINCT {
                           organization: org {.*},
                           deal: d {.*}
                       }) AS customers,
                       collect(DISTINCT i {.*}) AS relatedIssues
                """,
                name=name,
            )
            record = await result.single()

            if not record or not record["product"]:
                raise HTTPException(status_code=404, detail=f"Product '{name}' not found")

            return {
                "product": dict(record["product"]),
                "customers": [
                    dict(c) for c in record["customers"]
                    if c and c.get("organization")
                ],
                "relatedIssues": [dict(i) for i in record["relatedIssues"] if i],
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting product impact: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class PathsQuery(BaseModel):
    id1: str
    id2: str
    max_depth: int = 5


@app.post("/graph/paths")
async def find_paths(query: PathsQuery):
    """Find shortest paths between two organizations"""
    _require_crm_driver()
    depth = min(query.max_depth, 5)
    try:
        async with neo4j_driver.session() as session:
            result = await session.run(
                """
                MATCH (a:Organization {crm_id: $id1}), (b:Organization {crm_id: $id2})
                MATCH path = allShortestPaths((a)-[*..%d]-(b))
                WITH path LIMIT 10
                WITH collect(path) AS paths
                WITH
                    reduce(ns = [], p IN paths | ns + nodes(p)) AS allNodes,
                    reduce(rs = [], p IN paths | rs + relationships(p)) AS allRels
                UNWIND allNodes AS n
                WITH collect(DISTINCT n {.*, _labels: labels(n), _id: id(n)}) AS nodes, allRels
                UNWIND allRels AS r
                RETURN nodes,
                       collect(DISTINCT {
                           _id: id(r),
                           _type: type(r),
                           _start: id(startNode(r)),
                           _end: id(endNode(r)),
                           properties: properties(r)
                       }) AS edges
                """ % depth,
                id1=query.id1,
                id2=query.id2,
            )
            record = await result.single()

            if not record or not record["nodes"]:
                return {"nodes": [], "edges": []}

            return {
                "nodes": [dict(n) for n in record["nodes"]],
                "edges": [dict(e) for e in record["edges"]],
            }
    except Exception as e:
        logger.error(f"Error finding paths: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
    )
