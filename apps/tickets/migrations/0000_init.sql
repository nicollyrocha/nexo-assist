CREATE TYPE "public"."affected" AS ENUM('so_eu', 'minha_equipe', 'empresa');--> statement-breakpoint
CREATE TYPE "public"."analyst_tier" AS ENUM('N1', 'N2');--> statement-breakpoint
CREATE TYPE "public"."author_kind" AS ENUM('funcionario', 'analista', 'agent');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('acesso', 'rede_vpn', 'hardware', 'software', 'email', 'outros');--> statement-breakpoint
CREATE TYPE "public"."ticket_event_kind" AS ENUM('comentario', 'status', 'transferencia', 'reabertura');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('critica', 'alta', 'media', 'baixa');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('aberto', 'em_andamento', 'aguardando_analista', 'aguardando_funcionario', 'aprovado', 'resolvido', 'fechado');--> statement-breakpoint
CREATE TYPE "public"."ticket_type" AS ENUM('INC', 'REQ');--> statement-breakpoint
CREATE SEQUENCE "public"."inc_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 20600 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."req_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 10600 CACHE 1;--> statement-breakpoint
CREATE TABLE "analysts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"tier" "analyst_tier" NOT NULL,
	CONSTRAINT "analysts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"department" text NOT NULL,
	CONSTRAINT "employees_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "help_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"category" "category" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" text NOT NULL,
	"kind" "ticket_event_kind" NOT NULL,
	"author_kind" "author_kind" NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "ticket_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" "category" NOT NULL,
	"priority" "priority" NOT NULL,
	"affected" "affected" NOT NULL,
	"status" "ticket_status" NOT NULL,
	"requester_id" text NOT NULL,
	"assigned_team" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_analyst_update_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"idempotency_key" text,
	CONSTRAINT "tickets_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_requester_id_employees_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "help_articles_fts_idx" ON "help_articles" USING gin (to_tsvector('portuguese', "title" || ' ' || "body"));--> statement-breakpoint
CREATE INDEX "ticket_events_ticket_idx" ON "ticket_events" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "tickets_requester_idx" ON "tickets" USING btree ("requester_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "tickets_due_idx" ON "tickets" USING btree ("due_at");