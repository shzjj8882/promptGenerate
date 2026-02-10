import { Metadata } from "next";
import { redirect } from "next/navigation";
import TeamsClient from "./teams-client";
import { getCurrentUserOnServer } from "@/lib/server-api/auth";
import { getTeams } from "@/lib/api/teams";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { isServerApiError } from "@/lib/server-api/errors";

export const metadata: Metadata = {
  title: "团队管理 - AILY",
};

export default async function TeamsPage() {
  const user = await getCurrentUserOnServer();
  if (!user.is_superuser) {
    redirect("/403");
  }

  try {
    const teamsRes = await getTeams({ skip: 0, limit: DEFAULT_PAGE_SIZE });

    return (
      <TeamsClient
        initialTeams={teamsRes.items}
        initialTotal={teamsRes.total}
        initialPage={1}
      />
    );
  } catch (e) {
    if (isServerApiError(e)) {
      if (e.status === 401) redirect("/login");
      if (e.status === 403) redirect("/403");
    }
    return <TeamsClient />;
  }
}
