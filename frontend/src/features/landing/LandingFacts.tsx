import type { RemixiconComponentType } from '@remixicon/react';

export interface LandingFact {
  text: string;
  icon: RemixiconComponentType;
}

/**
 * The few things a visitor should take away from a landing section, one short
 * line each with an icon for what it is about. Details belong on How it works
 * and the FAQ, not here.
 */
export function LandingFacts({ facts }: { facts: LandingFact[] }) {
  return (
    <ul className="mt-6 flex flex-col gap-2.5">
      {facts.map(({ text, icon: Icon }) => (
        <li key={text} className="flex items-center gap-2.5 text-body-regular text-text-secondary">
          <Icon className="size-4 shrink-0 text-text-tertiary" aria-hidden />
          {text}
        </li>
      ))}
    </ul>
  );
}
