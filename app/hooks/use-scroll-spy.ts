"use client";

import { useState, useEffect } from "react";

const SECTION_IDS = ["hero", "features", "use-cases", "enterprise", "how-it-works"];

/**
 * 滚动监听：当 section 进入视口上方 1/3 时视为激活
 */
export function useScrollSpy() {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const viewportHeight = window.innerHeight;
      const triggerLine = scrollTop + viewportHeight * 0.3;

      let current: string | null = null;
      for (const id of SECTION_IDS) {
        const el = document.getElementById(id);
        if (!el) continue;
        const { top, height } = el.getBoundingClientRect();
        const sectionTop = top + window.scrollY;
        if (sectionTop <= triggerLine && sectionTop + height > scrollTop) {
          current = id;
        }
      }
      setActiveId(current);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return activeId;
}
