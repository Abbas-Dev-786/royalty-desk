import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export interface Notice { readonly title: string; readonly description: string; readonly error?: boolean; readonly transactionHash?: string | undefined; }

export function ActionNotice({ notice }: Readonly<{ notice: Notice | null }>) {
  if (!notice) return null;
  return <Alert className={notice.error ? "notice-error" : "notice-success"} role={notice.error ? "alert" : "status"}><AlertTitle>{notice.title}</AlertTitle><AlertDescription>{notice.description}{notice.transactionHash && <><br /><a href={`https://explorer.testnet.near.org/transactions/${notice.transactionHash}`} target="_blank" rel="noreferrer">View transaction on NEAR Explorer</a></>}</AlertDescription></Alert>;
}
