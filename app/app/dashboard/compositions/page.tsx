import { Metadata } from "next";
import { CompositionsClient } from "./compositions-client";

export const metadata: Metadata = {
  title: "组合模式 - PromptHub",
};

export default function CompositionsPage() {
  return <CompositionsClient />;
}
