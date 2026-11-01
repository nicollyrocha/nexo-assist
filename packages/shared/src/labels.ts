import type { Affected, Category, Priority, TicketStatus, TicketType } from "./domain";

// Rótulos de exibição em pt-BR, usados pela UI e pelo agent nas respostas.

export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  INC: "Incidente",
  REQ: "Requisição",
};

export const CATEGORY_LABELS: Record<Category, string> = {
  acesso: "Acesso",
  rede_vpn: "Rede e VPN",
  hardware: "Hardware",
  software: "Software",
  email: "E-mail",
  outros: "Outros",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

export const AFFECTED_LABELS: Record<Affected, string> = {
  so_eu: "Só eu",
  minha_equipe: "Minha equipe",
  empresa: "A empresa toda",
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  aguardando_analista: "Aguardando analista",
  aguardando_funcionario: "Aguardando você",
  aprovado: "Aprovado",
  resolvido: "Resolvido",
  fechado: "Fechado",
};
