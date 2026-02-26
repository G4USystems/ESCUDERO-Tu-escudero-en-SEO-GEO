"use client";

import { useParams } from "next/navigation";
import { SanchoBot } from "./SanchoBot";

export function SanchoGlobal() {
  const params = useParams();
  const projectId = params?.id as string | undefined;

  return <SanchoBot projectId={projectId} />;
}
