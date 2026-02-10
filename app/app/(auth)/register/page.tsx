import { Metadata } from "next";
import { RegisterForm } from "../components/register-form";

export const metadata: Metadata = {
  title: "注册 - AILY 控制台",
};

export default function RegisterPage() {
  return <RegisterForm />;
}


