import { Badge } from './ui';
import { label } from '@/lib/i18n';

const taskTone = { new: 'info', assigned: 'info', in_progress: 'accent', waiting_other_party: 'warning', completed: 'success', cancelled: 'neutral' } as const;
const prioTone = { low: 'neutral', normal: 'info', high: 'warning', critical: 'danger' } as const;
const leaveTone = { draft: 'neutral', submitted: 'info', pending_review: 'warning', recommended: 'accent', approved: 'success', rejected: 'danger', cancelled: 'neutral' } as const;
const planTone = { planned: 'neutral', in_progress: 'accent', awaiting_practical: 'warning', completed: 'success', overdue: 'danger' } as const;
const ideaTone = { submitted: 'info', under_review: 'warning', approved: 'accent', in_progress: 'accent', implemented: 'success', rejected: 'neutral' } as const;
const levelTone = { 1: 'danger', 2: 'warning', 3: 'info', 4: 'success' } as const;
const critTone = { low: 'neutral', medium: 'info', high: 'warning', critical: 'danger' } as const;

export const TaskStatus = ({ v }: { v: string }) => <Badge tone={(taskTone as any)[v]}>{label('task_status', v)}</Badge>;
export const Priority = ({ v }: { v: string }) => <Badge tone={(prioTone as any)[v]}>{label('task_priority', v)}</Badge>;
export const LeaveStatus = ({ v }: { v: string }) => <Badge tone={(leaveTone as any)[v]}>{label('leave_status', v)}</Badge>;
export const PlanStatus = ({ v }: { v: string }) => <Badge tone={(planTone as any)[v]}>{label('plan_status', v)}</Badge>;
export const IdeaStatus = ({ v }: { v: string }) => <Badge tone={(ideaTone as any)[v]}>{label('idea_status', v)}</Badge>;
export const Criticality = ({ v }: { v: string }) => <Badge tone={(critTone as any)[v]}>{label('skill_criticality', v)}</Badge>;
export function SkillLevel({ v, compact }: { v?: number | null; compact?: boolean }) {
  if (!v) return <Badge>غير مقيّم</Badge>;
  return <Badge tone={(levelTone as any)[v]} className="num">{compact ? `${v}` : `${v} – ${label('skill_level', v)}`}</Badge>;
}
