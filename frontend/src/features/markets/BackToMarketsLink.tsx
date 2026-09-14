import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { RiArrowLeftLine } from "@remixicon/react";

/** Shared by the security and index detail pages — both drill in from Markets. */
export function BackToMarketsLink() {
  const { t } = useTranslation();
  return (
    <Link
      className="inline-flex w-fit items-center gap-1 text-body-medium text-text-secondary hover:text-text-primary"
      to="/markets"
    >
      <RiArrowLeftLine className="size-4" aria-hidden />
      {t("securityDetail.back")}
    </Link>
  );
}
