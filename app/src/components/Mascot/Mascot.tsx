import { useTranslation } from "react-i18next";

import championMascotUrl from "@branding/mascots/tora-champion.svg";
import focusedMascotUrl from "@branding/mascots/tora-focused.svg";
import happyMascotUrl from "@branding/mascots/tora-happy.svg";
import neutralMascotUrl from "@branding/mascots/tora-neutral.svg";
import sleepingMascotUrl from "@branding/mascots/tora-sleeping.svg";
import surprisedMascotUrl from "@branding/mascots/tora-surprised.svg";

export type MascotMood =
  | "sleeping"
  | "neutral"
  | "focused"
  | "happy"
  | "surprised"
  | "champion";

interface MascotProps {
  mood: MascotMood;
  className?: string;
}

const MASCOTS: Record<MascotMood, { src: string; altKey: string }> = {
  sleeping: {
    src: sleepingMascotUrl,
    altKey: "app.altMascotSleeping",
  },
  neutral: {
    src: neutralMascotUrl,
    altKey: "app.altMascotNeutral",
  },
  focused: {
    src: focusedMascotUrl,
    altKey: "app.altMascotFocused",
  },
  happy: {
    src: happyMascotUrl,
    altKey: "app.altMascotHappy",
  },
  surprised: {
    src: surprisedMascotUrl,
    altKey: "app.altMascotSurprised",
  },
  champion: {
    src: championMascotUrl,
    altKey: "app.altMascotChampion",
  },
};

export default function Mascot({ mood, className }: MascotProps) {
  const { t } = useTranslation();
  const item = MASCOTS[mood];

  return (
    <img
      src={item.src}
      alt={t(item.altKey)}
      className={className}
      draggable={false}
    />
  );
}
