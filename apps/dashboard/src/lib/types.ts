export type SubStepStatus =
  | "not_started"
  | "in_progress"
  | "waiting_client"
  | "blocked"
  | "done";

export type StepStatus = SubStepStatus | "not_applicable";

export interface EmailTemplate {
  subject: string;
  body: string;
}

export interface Support {
  label: string;
  type: "pdf" | "link" | "video";
  url?: string;
}

export interface SubStep {
  id: string;
  title: string;
  status: SubStepStatus;
  actions?: string[];
  emailTemplate?: EmailTemplate;
  supports?: Support[];
}

export interface PlanStep {
  code: string; // "01", "03.01", ...
  title: string;
  applicable: boolean;
  slaDays: number;
  deadline?: string; // ISO date, computed from signature date
  subSteps: SubStep[];
}

export type OfficerRole = "officer" | "founder";

export interface Officer {
  id: string;
  name: string;
  role: OfficerRole;
}

export interface Broker {
  id: string;
  societe: string;
  contact: string;
  emails: string[];
  countries: string[];
  officerId: string;
  signatureDate: string; // ISO date
  bce?: string;
  website?: string;
  lastContactDate?: string; // ISO date
  onboardingStatus: string[];
  plan: PlanStep[];
}
