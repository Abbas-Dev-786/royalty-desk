import { currentUser } from "@/server/runtime";

export async function GET(): Promise<Response> {
  const user = await currentUser();
  return user ? Response.json({ accountId: user.accountId, networkId: user.networkId, publicKey: user.publicKey }) : Response.json({ error: "unauthorized" }, { status: 401 });
}
