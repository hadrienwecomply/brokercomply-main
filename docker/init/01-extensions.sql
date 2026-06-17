-- Enable pgvector before migrations run. The pgvector/pgvector image ships the
-- extension binaries; this creates it in the brokercomply database.
CREATE EXTENSION IF NOT EXISTS vector;
