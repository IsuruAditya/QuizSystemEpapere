import { pageQuery } from "@/server/http/contracts";
import { slugParams, withRoute } from "@/server/http/route";
import { getLeaderboardForViewer } from "@/server/results/access";

export const runtime = "nodejs";

const query = pageQuery;

export const GET = withRoute({ auth: "any", query, params: slugParams }, async ({ actor, params, query }) => getLeaderboardForViewer(actor, params.slug, query));
