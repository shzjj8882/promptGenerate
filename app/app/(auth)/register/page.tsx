import { Metadata } from "next";
import { RegisterForm } from "../components/register-form";

export const metadata: Metadata = {
  title: "注册 - PromptHub 工作台",
};

export default function RegisterPage() {
  return <RegisterForm />;
}


