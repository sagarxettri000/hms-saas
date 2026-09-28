-- Maitri Assistant: AI sessions, messages, tool-call audit trail.
-- Purely additive; no changes to existing HMS tables.

CREATE TABLE "ai_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currentRoute" TEXT,
    "contextModule" TEXT,
    "contextEntity" TEXT,
    "contextEntityId" TEXT,
    "context" JSONB,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_tool_calls" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "inputSummary" JSONB,
    "status" TEXT NOT NULL,
    "executionTimeMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_tool_calls_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_sessions_userId_lastActivityAt_idx" ON "ai_sessions"("userId", "lastActivityAt");
CREATE INDEX "ai_sessions_tenantId_createdAt_idx" ON "ai_sessions"("tenantId", "createdAt");

CREATE INDEX "ai_messages_sessionId_createdAt_idx" ON "ai_messages"("sessionId", "createdAt");

CREATE INDEX "ai_tool_calls_sessionId_createdAt_idx" ON "ai_tool_calls"("sessionId", "createdAt");
CREATE INDEX "ai_tool_calls_userId_createdAt_idx" ON "ai_tool_calls"("userId", "createdAt");
CREATE INDEX "ai_tool_calls_toolName_status_idx" ON "ai_tool_calls"("toolName", "status");

ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ai_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ai_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
