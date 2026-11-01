CREATE TYPE "public"."confidence_level" AS ENUM('alta', 'media', 'baixa');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('ativa', 'aguardando_atendente', 'em_atendimento', 'encerrada');--> statement-breakpoint
CREATE TYPE "public"."intent" AS ENUM('duvida', 'consultar_chamado', 'complementar_chamado', 'abrir_chamado', 'confirmar_rascunho', 'falar_com_analista', 'fora_de_escopo', 'conversa');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('funcionario', 'agent', 'analista', 'sistema');--> statement-breakpoint
CREATE TYPE "public"."outcome" AS ENUM('respondeu', 'pediu_informacao', 'propos_rascunho', 'criou_chamado', 'atualizou_chamado', 'reabriu_chamado', 'transferiu', 'redirecionou', 'falhou');--> statement-breakpoint
CREATE TYPE "public"."transfer_reason" AS ENUM('pedido_do_funcionario', 'caso_critico', 'chamado_vencido', 'baixa_confianca');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('funcionario', 'analista');--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" text NOT NULL,
	"status" "conversation_status" DEFAULT 'ativa' NOT NULL,
	"assigned_analyst_id" text,
	"transfer_reason" "transfer_reason",
	"summary" text,
	"ticket_id" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decision_traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"trace" jsonb NOT NULL,
	"intent" "intent" NOT NULL,
	"outcome" "outcome" NOT NULL,
	"confidence_level" "confidence_level" NOT NULL,
	"confidence_score" real NOT NULL,
	"transferred" boolean DEFAULT false NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"author_id" text,
	"content" text NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"trace_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" "user_role" NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "decision_traces" ADD CONSTRAINT "decision_traces_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_employee_idx" ON "conversations" USING btree ("employee_id","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_status_idx" ON "conversations" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "traces_conversation_idx" ON "decision_traces" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "traces_confidence_idx" ON "decision_traces" USING btree ("confidence_level","created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");