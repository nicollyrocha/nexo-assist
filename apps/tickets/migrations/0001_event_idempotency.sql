ALTER TABLE "ticket_events" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_idempotency_key_unique" UNIQUE("idempotency_key");