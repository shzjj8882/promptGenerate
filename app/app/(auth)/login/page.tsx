import { Metadata } from "next";
import { LoginForm } from "../components/login-form";

export const metadata: Metadata = {
  title: "登录 - PromptHub 控制台",
};

export default function LoginPage() {
  return <LoginForm />;
}


