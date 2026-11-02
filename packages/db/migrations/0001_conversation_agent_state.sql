ALTER TABLE "conversations" ADD COLUMN "agent_state" jsonb;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "status_changed_at" timestamp with time zone DEFAULT now() NOT NULL;