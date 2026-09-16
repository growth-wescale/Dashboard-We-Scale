import {
  Search, Phone, MessageSquare, Handshake, Link, CalendarCheck, Users, CircleCheck, FileText, Gavel, FilePen,
  Trophy, CircleX, Ban, Video, Mail, MessageCircle, ListTodo, Utensils, RotateCcw, HelpCircle, Flag, UserRound, ArrowRightLeft,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** Chave = StageKey, tipo de nó, tipo de tarefa, ou fase (macro). Todos os nomes conferidos em lucide-react 1.24. */
const MAPA: Record<string, LucideIcon> = {
  'MQL': Search, 'Tentando Contato': Phone, 'Contato Efetivo': MessageSquare, 'Interesse Reunião': Handshake, 'Conexão': Link,
  'Reunião Agendada SQL': CalendarCheck, 'Diagnóstico': Users, 'SAL': CircleCheck, 'Oportunidade COF': FileText, 'Comitê': Gavel,
  'Pré-Contrato': FilePen, 'Fechamento': Trophy, 'No Show': Ban,
  ganho: Trophy, perda: CircleX, no_show: Ban, retomada: RotateCcw, em_andamento: Flag, desconhecida: HelpCircle,
  SDR: Phone, Closer: Handshake,
  call: Phone, whatsapp: MessageCircle, email: Mail, task: ListTodo, lunch: Utensils, meeting: Users, outro: ListTodo, reuniao: Video,
  troca_responsavel: UserRound, mudanca_funil: ArrowRightLeft, mudanca_campo: ArrowRightLeft,
}

export function IconeDe({ chave, size = 22 }: { chave: string; size?: number }) {
  const Icon = MAPA[chave] ?? HelpCircle
  return <Icon size={size} strokeWidth={2.2} color="#fff" />
}
