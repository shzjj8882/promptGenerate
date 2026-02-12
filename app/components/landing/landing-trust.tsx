import { Lock, Layers, Database } from "lucide-react";
import { LandingAnimateIn } from "./landing-animate-in";

const trustItems = [
  {
    icon: Lock,
    text: "企业级安全",
  },
  {
    icon: Layers,
    text: "多租户隔离",
  },
  {
    icon: Database,
    text: "数据可控",
  },
];

export function LandingTrust() {
  return (
    <section className="flex min-h-screen min-h-[100dvh] flex-col justify-center border-t border-border px-4 py-12 sm:px-6">
      <div className="container mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
          {trustItems.map((item, i) => {
            const Icon = item.icon;
            return (
              <LandingAnimateIn key={item.text} delay={i * 80}>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="h-5 w-5" />
                  <span className="text-sm font-medium">{item.text}</span>
                </div>
              </LandingAnimateIn>
            );
          })}
        </div>
      </div>
    </section>
  );
}
