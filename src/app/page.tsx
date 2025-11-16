import { auth } from "@/auth";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();
  if (!session) {
    redirect("/sign-in");
  }
  return <ChatLayout />;
}
