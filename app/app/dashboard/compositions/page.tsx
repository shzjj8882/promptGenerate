import { Metadata } from "next";
import { CompositionsClient } from "./compositions-client";

export const metadata: Metadata = {
  title: "组合 - PromptHub",
};

export default function CompositionsPage() {
  return <CompositionsClient />;
}
