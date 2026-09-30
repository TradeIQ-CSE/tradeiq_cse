import { stabilizeAnchor } from './stabilize-anchor';
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiMenuLine,
  RiExternalLinkLine,
} from "@remixicon/react";
import { Badge } from "@/components/base/badges/badge";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/base/segmented-control/segmented-control";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/base/table/table";
import { LandingNav } from "@/features/landing/LandingNav";
import { LandingFooter } from "@/features/landing/LandingFooter";
import { CodeBlock } from "./CodeBlock";
import {
  PUBLIC_API_BASE_URL,
  PUBLIC_API_DOCS_URL,
  PUBLIC_API_SPEC_URL,
} from "./constants";
import {
  ENDPOINTS,
  PAGINATION_EXAMPLE,
  parameterDetails,
  operationExamples,
  referenceDocument,
  requestSnippet,
  schemaExample,
  schemaFields,
  schemaType,
  type Schema,
  type Endpoint,
  type Language,
} from "./reference-model";
import { cx } from "@/utils/cx";
import "@/features/landing/landing.css";

const GUIDES = [
  "overview",
  "authentication",
  "rate-limits",
  "pagination",
  "data-conventions",
] as const;
const FOOT_GUIDES = ["errors", "versioning"] as const;
const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring";
const NAV_ITEMS = [
  ...GUIDES.map((id) => ({ id, key: `sections.${id}.title` })),
  ...ENDPOINTS.map(({ id, key }) => ({ id, key: `operations.${key}.title` })),
  ...FOOT_GUIDES.map((id) => ({ id, key: `sections.${id}.title` })),
];

export function ApiReferencePage() {
  const { t } = useTranslation();
  const { hash } = useLocation();
  const [contentsOpen, setContentsOpen] = useState(false);
  useEffect(() => {
    // Lazy route mounting happens after the browser's initial hash jump.
    if (!hash) return;
    let id: string;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      return;
    }
    const root = document.getElementById('reference-main');
    if (root) return stabilizeAnchor(id, root);
  }, [hash]);
  const contents = (
    <nav
      aria-label={t("apiReference.contents")}
      className="flex flex-col gap-1"
    >
      {NAV_ITEMS.map(({ id, key }) => (
        <a
          key={id}
          href={`#${id}`}
          onClick={() => setContentsOpen(false)}
          className={cx(
            "rounded-lg px-3 py-2 text-body-2-medium text-text-secondary hover:bg-background-secondary-hover hover:text-text-primary",
            FOCUS,
          )}
        >
          {t(`apiReference.${key}`)}
        </a>
      ))}
    </nav>
  );
  return (
    <div className="min-h-dvh bg-background-primary-default text-text-primary">
      <a href="#reference-main" className="landing-skip-link">
        {t("apiReference.skip")}
      </a>
      <LandingNav />
      <div className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          to="/developers"
          className={cx(
            "inline-flex items-center gap-2 rounded-lg text-body-2-medium text-text-secondary hover:text-text-primary",
            FOCUS,
          )}
        >
          <RiArrowLeftLine className="size-4" aria-hidden />
          {t("apiReference.back")}
        </Link>
        <header className="mt-6 flex min-w-0 flex-col gap-4 border-b border-separator-border pb-8">
          <p className="text-caption-1-semibold text-status-blue-text">
            {t("apiReference.eyebrow")}
          </p>
          <h1 className="text-title-1-medium">{t("apiReference.title")}</h1>
          <p className="max-w-3xl text-body-regular text-text-secondary">
            {t("apiReference.intro")}
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/api-key" leadingIcon={RiArrowRightLine}>
              {t("apiReference.getKey")}
            </ButtonLink>
            <ButtonLink
              href={PUBLIC_API_DOCS_URL}
              variant="secondary"
              target="_blank"
              rel="noreferrer"
              trailingIcon={RiExternalLinkLine}
            >
              {t("apiReference.explorer")}
            </ButtonLink>
            <ButtonLink
              href={PUBLIC_API_SPEC_URL}
              download="tradeiq-public-api-v1.json"
              variant="ghost"
              target="_blank"
              rel="noreferrer"
            >
              {t("apiReference.spec")}
            </ButtonLink>
          </div>
        </header>
        <div className="mt-6 lg:hidden">
          <Button
            type="button"
            variant="secondary"
            leadingIcon={RiMenuLine}
            aria-expanded={contentsOpen}
            aria-controls="reference-mobile-contents"
            onClick={() => setContentsOpen(!contentsOpen)}
          >
            {t("apiReference.contents")}
          </Button>
          {contentsOpen && (
            <div
              id="reference-mobile-contents"
              className="mt-3 rounded-3xl border border-border-button-default p-3"
            >
              {contents}
            </div>
          )}
        </div>
        <div className="mt-8 grid min-w-0 gap-10 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 max-h-[calc(100dvh-8rem)] overflow-y-auto">
              <p className="px-3 pb-3 text-caption-1-semibold text-text-tertiary">
                {t("apiReference.contents")}
              </p>
              {contents}
            </div>
          </aside>
          <main id="reference-main" className="min-w-0" tabIndex={-1}>
            {GUIDES.map((id) => (
              <Section
                key={id}
                id={id}
                title={t(`apiReference.sections.${id}.title`)}
              >
                <p className="max-w-prose text-body-regular text-text-secondary">
                  {t(`apiReference.sections.${id}.body`)}
                </p>
                {id === "overview" && (
                  <CodeBlock
                    code={PUBLIC_API_BASE_URL}
                    copyLabel={t("apiReference.copyBase")}
                    className="mt-4"
                  />
                )}
                {id === "authentication" && (
                  <>
                    <CodeBlock
                      code="X-API-Key: YOUR_KEY"
                      copyLabel={t("apiReference.copyHeader")}
                      className="mt-4"
                    />
                    <p className="mt-4 max-w-prose text-body-regular text-text-secondary">
                      {t("apiReference.authMore")}
                    </p>
                    <Link
                      to="/api-key"
                      className={cx(
                        "mt-3 inline-block rounded-lg text-body-medium text-status-blue-text hover:underline",
                        FOCUS,
                      )}
                    >
                      {t("apiReference.getKey")}
                    </Link>
                  </>
                )}
                {id === "rate-limits" && (
                  <>
                    <HeaderTable />
                    <p className="mt-4 max-w-prose text-body-regular text-text-secondary">
                      {t("apiReference.edgeLimit")}
                    </p>
                  </>
                )}
                {id === "pagination" && (
                  <>
                    <p className="mt-4 max-w-prose text-body-regular text-text-secondary">
                      {t("apiReference.dates")}
                    </p>
                    <h3 className="mt-6 text-headline-medium">
                      {t("apiReference.paginateTitle")}
                    </h3>
                    <p className="mt-2 text-body-2-regular text-text-secondary">
                      {t("apiReference.paginateNote")}
                    </p>
                    <CodeBlock
                      code={PAGINATION_EXAMPLE}
                      copyLabel={t("apiReference.copyPagination")}
                      className="mt-4"
                    />
                  </>
                )}
                {id === "data-conventions" && (
                  <p className="mt-4 max-w-prose text-body-regular text-text-secondary">
                    {t("apiReference.aggregateNote")}
                  </p>
                )}
              </Section>
            ))}
            <p className="mb-8 rounded-2xl bg-background-secondary-default p-4 text-body-2-regular text-text-secondary">
              {t("apiReference.generatedNote")}
            </p>
            {ENDPOINTS.map((endpoint) => (
              <EndpointSection key={endpoint.id} endpoint={endpoint} />
            ))}
            <Section
              id="errors"
              title={t("apiReference.sections.errors.title")}
            >
              <p className="max-w-prose text-body-regular text-text-secondary">
                {t("apiReference.sections.errors.body")}
              </p>
              <p className="mt-4 max-w-prose text-body-regular text-text-secondary">
                {t("apiReference.errorHandling")}
              </p>
              {[
                ["ValidationFailedErrorSchema", "validation"],
                ["UnauthenticatedErrorSchema", "authentication"],
                ["SecurityNotFoundErrorSchema", "security"],
                ["IndexNotFoundErrorSchema", "index"],
                ["ExternalRateLimitedErrorSchema", "rateLimit"],
              ].map(([name, labelKey]) => (
                <div key={name} className="mt-6">
                  <h3 className="mb-3 text-headline-medium">
                    {String((schemaExample(referenceDocument.components.schemas[name]) as { error: { code: string } }).error.code)}
                  </h3>
                  <FieldsTable
                    schema={referenceDocument.components.schemas[name]}
                    label={t("apiReference.errorFields", {
                      error: t(`apiReference.errorNames.${labelKey}`),
                    })}
                  />
                  <CodeBlock
                    className="mt-3"
                    code={JSON.stringify(
                      schemaExample(referenceDocument.components.schemas[name]),
                      null,
                      2,
                    )}
                    copyLabel={t("apiReference.copyError")}
                  />
                </div>
              ))}
              <h3 className="mb-3 mt-6 text-headline-medium">{t('apiReference.edge429Example')}</h3><CodeBlock code={JSON.stringify(referenceDocument.paths[ENDPOINTS[0].path].get.responses['429'].content?.['application/json'].examples?.edge.value, null, 2)} copyLabel={t('apiReference.copyError')} />
            </Section>
            <Section
              id="versioning"
              title={t("apiReference.sections.versioning.title")}
            >
              <p className="max-w-prose text-body-regular text-text-secondary">
                {t("apiReference.sections.versioning.body")}
              </p>
            </Section>
          </main>
        </div>
      </div>
      <LandingFooter />
    </div>
  );
}
function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="mb-10 min-w-0 scroll-mt-52 border-b border-separator-border pb-10 lg:scroll-mt-28"
      aria-labelledby={`${id}-heading`}
    >
      <h2 id={`${id}-heading`} className="mb-4 text-title-2-medium">
        <a href={`#${id}`} className={cx("rounded-lg hover:underline", FOCUS)}>
          {title}
        </a>
      </h2>
      {children}
    </section>
  );
}
function HeaderTable() {
  const { t } = useTranslation();
  const headers =
    referenceDocument.paths[ENDPOINTS[0].path].get.responses["200"].headers ??
    {};
  return (
    <Table
      className="mt-4"
      size="sm"
      aria-label={t("apiReference.quotaHeaders")}
    >
      <TableHeader>
        <TableColumn isRowHeader>{t("apiReference.header")}</TableColumn>
        <TableColumn>{t("apiReference.description")}</TableColumn>
      </TableHeader>
      <TableBody>
        {Object.entries(headers).map(([name, value]) => (
          <TableRow key={name}>
            <TableCell>
              <code>{name}</code>
            </TableCell>
            <TableCell>
              <span lang="en" className="whitespace-normal">
                {value.description}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
function EndpointSection({ endpoint }: { endpoint: Endpoint }) {
  const { t } = useTranslation();
  const [language, setLanguage] = useState<Language>("curl");
  const [exampleKey, setExampleKey] = useState("primary");
  const examples = operationExamples(endpoint);
  const example = examples[exampleKey];
  const operation = referenceDocument.paths[endpoint.path].get;
  const responseSchema =
    operation.responses["200"].content?.["application/json"].schema ?? {};
  return (
    <Section
      id={endpoint.id}
      title={t(`apiReference.operations.${endpoint.key}.title`)}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Badge color="neutral" className="rounded-lg px-2 py-1">
          GET
        </Badge>
        <code className="min-w-0 break-all text-body-medium">
          {endpoint.path.replace("/public/v1", "")}
        </code>
      </div>
      <p className="mt-4 max-w-prose text-body-regular text-text-secondary">
        {t(`apiReference.operations.${endpoint.key}.note`)}
      </p>
      <h3 className="mb-3 mt-6 text-headline-medium">
        {t("apiReference.parameters")}
      </h3>
      {operation.parameters?.length ? (
        <Table
          aria-label={t("apiReference.parameterTable", {
            endpoint: endpoint.path,
          })}
          size="sm"
        >
          <TableHeader>
            <TableColumn isRowHeader>{t("apiReference.name")}</TableColumn>
            <TableColumn>{t("apiReference.type")}</TableColumn>
            <TableColumn>{t("apiReference.description")}</TableColumn>
          </TableHeader>
          <TableBody>
            {operation.parameters.map((parameter) => (
              <TableRow key={parameter.name}>
                <TableCell>
                  <code>{parameter.name}</code>
                  <span className="block text-caption-1-regular text-text-tertiary">
                    {parameter.in} ·{" "}
                    {t(
                      parameter.required
                        ? "apiReference.required"
                        : "apiReference.optional",
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  <code>{schemaType(parameter.schema)}</code>
                </TableCell>
                <TableCell>
                  <span className="whitespace-normal" lang="en">
                    {parameterDetails(parameter)}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-body-2-regular text-text-secondary">
          {t("apiReference.noParameters")}
        </p>
      )}
      {Object.keys(examples).length > 1 && <div className="mt-6"><h3 className="mb-3 text-headline-medium">{t('apiReference.chooseExample')}</h3><div role="group" aria-label={t('apiReference.exampleFor', { endpoint: endpoint.path })} className="flex flex-wrap gap-2">{['primary', ...Object.keys(examples).filter((key) => key !== 'primary')].map((key) => <Button key={key} type="button" size="small" variant={exampleKey === key ? 'primary' : 'secondary'} aria-pressed={exampleKey === key} onClick={() => setExampleKey(key)}>{t(`apiReference.exampleKinds.${key}`)}</Button>)}</div><p lang="en" className="mt-3 max-w-prose text-body-2-regular text-text-secondary">{example.summary}</p></div>}
      <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-2">
        <div className="min-w-0">
          <h3 className="mb-3 text-headline-medium">
            {t("apiReference.request")}
          </h3>
          <SegmentedControl
            aria-label={t("apiReference.languageFor", {
              endpoint: endpoint.path,
            })}
            className="max-w-full"
            selectedKeys={new Set([language])}
            onSelectionChange={(keys) => {
              const [next] = [...keys];
              if (next) setLanguage(next as Language);
            }}
          >
            {(["curl", "python", "javascript"] as const).map((value) => (
              <SegmentedControlItem id={value} key={value}>
                {t(`developers.start.read.tabs.${value}`)}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
          <CodeBlock
            className="mt-3"
            code={requestSnippet(endpoint, language, exampleKey)}
            copyLabel={t("apiReference.copyRequest", {
              endpoint: endpoint.path,
            })}
          />
        </div>
        <div className="min-w-0">
          <h3 className="mb-3 text-headline-medium">
            {t("apiReference.responseExample")}
          </h3>
          <p className="mb-3 text-body-2-regular text-text-tertiary">
            {t("apiReference.illustrative")}
          </p>
          <CodeBlock
            code={JSON.stringify(example.value, null, 2)}
            copyLabel={t("apiReference.copyResponse", {
              endpoint: endpoint.path,
            })}
          />
        </div>
      </div>
      <h3 className="mb-3 mt-6 text-headline-medium">
        {t("apiReference.responseFields")}
      </h3>
      <FieldsTable
        schema={responseSchema}
        label={t("apiReference.schemaTable", { endpoint: endpoint.path })}
      />
      <h3 className="mb-3 mt-6 text-headline-medium">
        {t("apiReference.responses")}
      </h3>
      <Table
        aria-label={t("apiReference.statusTable", { endpoint: endpoint.path })}
        size="sm"
      >
        <TableHeader>
          <TableColumn isRowHeader>{t("apiReference.status")}</TableColumn>
          <TableColumn>{t("apiReference.description")}</TableColumn>
        </TableHeader>
        <TableBody>
          {Object.entries(operation.responses).map(([status, response]) => (
            <TableRow key={status}>
              <TableCell>{status}</TableCell>
              <TableCell>
                <span lang="en" className="whitespace-normal">
                  {response.description}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
}

function FieldsTable({ schema, label }: { schema: Schema; label: string }) {
  const { t } = useTranslation();
  return (
    <Table aria-label={label} size="sm">
      <TableHeader>
        <TableColumn isRowHeader>{t("apiReference.field")}</TableColumn>
        <TableColumn>{t("apiReference.type")}</TableColumn>
        <TableColumn>{t("apiReference.description")}</TableColumn>
      </TableHeader>
      <TableBody>
        {schemaFields(schema).map((field) => (
          <TableRow key={field.name}>
            <TableCell>
              <code>{field.name}</code>
              <span className="block text-caption-1-regular text-text-tertiary">
                {t(
                  field.required
                    ? "apiReference.required"
                    : "apiReference.optional",
                )}
              </span>
            </TableCell>
            <TableCell>
              <code lang="en">{field.type}</code>
            </TableCell>
            <TableCell>
              <span lang="en" className="whitespace-normal">
                {field.description || "—"}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
