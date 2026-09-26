-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT,
    "imageSha256" TEXT NOT NULL,
    "originalPath" TEXT NOT NULL,
    "derivedPath" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "pipelineVersion" TEXT NOT NULL,
    "transcription" JSONB,
    "modernization" JSONB,
    "annotations" JSONB,
    "runInfo" JSONB
);

-- CreateTable
CREATE TABLE "AudioClip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "textSha256" TEXT NOT NULL,
    "voiceId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "audioPath" TEXT NOT NULL,
    "durationSec" REAL NOT NULL,
    "words" JSONB NOT NULL,
    CONSTRAINT "AudioClip_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Correction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "before" TEXT NOT NULL,
    "after" TEXT NOT NULL,
    CONSTRAINT "Correction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvalRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "samples" JSONB NOT NULL
);

-- CreateIndex
CREATE INDEX "Document_imageSha256_pipelineVersion_idx" ON "Document"("imageSha256", "pipelineVersion");

-- CreateIndex
CREATE UNIQUE INDEX "AudioClip_documentId_variant_textSha256_voiceId_modelId_key" ON "AudioClip"("documentId", "variant", "textSha256", "voiceId", "modelId");
