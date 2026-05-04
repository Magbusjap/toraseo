import type { AnalysisTypeId } from "./analysisTypes";

export type CatalogToolGroup =
  | "primary"
  | "secondary"
  | "additional"
  | "choice";

export type CatalogToolChange = "stable" | "added" | "moved" | "removed";

export interface CatalogText {
  ru: string;
  en: string;
}

export interface CatalogToolRow {
  name: CatalogText;
  group: CatalogToolGroup;
  change?: CatalogToolChange;
  description: CatalogText;
}

export interface CatalogAnalysisSection {
  analysisType: AnalysisTypeId;
  rows: CatalogToolRow[];
}

export interface CatalogVersion {
  version: string;
  label: CatalogText;
  status: "current" | "archive";
  sections: CatalogAnalysisSection[];
}

function text(ru: string, en: string): CatalogText {
  return { ru, en };
}

const siteByUrlCurrent: CatalogToolRow[] = [
  {
    name: text("Быстрое сканирование страницы", "Quick page scan"),
    group: "primary",
    description: text(
      "Проверяет базовые SEO-сигналы страницы: статус, title, H1, description и время ответа.",
      "Checks basic page SEO signals: status, title, H1, description, and response time.",
    ),
  },
  {
    name: text("Meta-теги", "Meta tags"),
    group: "primary",
    description: text(
      "Проверяет title, description, canonical, robots, Open Graph, Twitter Card и технические meta-теги.",
      "Checks title, description, canonical, robots, Open Graph, Twitter Card, and technical meta tags.",
    ),
  },
  {
    name: text("Заголовки", "Headings"),
    group: "primary",
    description: text(
      "Проверяет H1-H6, пропуски уровней, пустые заголовки и структуру страницы.",
      "Checks H1-H6, skipped levels, empty headings, and page outline structure.",
    ),
  },
  {
    name: text("Контент страницы", "Page content"),
    group: "primary",
    description: text(
      "Извлекает основной текст, считает слова, ссылки, изображения и text-to-code ratio.",
      "Extracts main text and counts words, links, images, and text-to-code ratio.",
    ),
  },
  {
    name: text("robots.txt", "robots.txt"),
    group: "secondary",
    description: text(
      "Проверяет, разрешено ли ToraSEO сканировать страницу по правилам robots.txt.",
      "Checks whether ToraSEO may scan the page according to robots.txt.",
    ),
  },
  {
    name: text("Sitemap", "Sitemap"),
    group: "secondary",
    description: text(
      "Находит sitemap и проверяет базовые структурные проблемы карты сайта.",
      "Finds the sitemap and checks basic sitemap structure issues.",
    ),
  },
  {
    name: text("Редиректы", "Redirects"),
    group: "secondary",
    description: text(
      "Проверяет цепочку редиректов, петли, ошибки и лишние переходы.",
      "Checks redirect chains, loops, failures, and excessive hops.",
    ),
  },
  {
    name: text("Технологический стек", "Technology stack"),
    group: "secondary",
    change: "added",
    description: text(
      "Определяет публичные признаки CMS, фреймворка, аналитики, CDN и сервера.",
      "Detects public CMS, framework, analytics, CDN, and server signals.",
    ),
  },
];

const articleTextCurrent: CatalogToolRow[] = [
  {
    name: text("Уникальность статьи", "Article uniqueness"),
    group: "primary",
    change: "added",
    description: text(
      "Встроенная локальная оценка повторов и шаблонности. Это не интернет-проверка плагиата.",
      "Built-in local repetition and template-risk estimate. This is not internet plagiarism detection.",
    ),
  },
  {
    name: text("Синтаксис языка", "Language syntax"),
    group: "primary",
    change: "added",
    description: text(
      "Встроенная проверка пунктуации, границ предложений и грамматически подозрительных мест.",
      "Built-in check for punctuation, sentence boundaries, and grammar-adjacent risks.",
    ),
  },
  {
    name: text("Вероятность написания ИИ", "AI writing probability"),
    group: "primary",
    change: "added",
    description: text(
      "Встроенная оценка ИИ-стиля по ритму, повторам и шаблонным формулировкам.",
      "Built-in AI-style estimate based on rhythm, repetition, and generic phrasing.",
    ),
  },
  {
    name: text("Естественность", "Naturalness"),
    group: "primary",
    change: "moved",
    description: text(
      "Встроенная проверка роботизированных повторов и механических формулировок.",
      "Built-in check for robotic repetition and mechanical wording.",
    ),
  },
  {
    name: text("Нарушение логики", "Logic issues"),
    group: "primary",
    change: "added",
    description: text(
      "Встроенная проверка противоречий, скачков вывода и слабых причинно-следственных связей.",
      "Built-in check for contradictions, conclusion jumps, and weak cause-effect links.",
    ),
  },
  {
    name: text("Прогноз интента и SEO-пакет", "Intent forecast and SEO package"),
    group: "primary",
    change: "added",
    description: text(
      "Встроенный локальный прогноз интента, хука, CTR/тренд-потенциала и черновика CMS-метаданных. Не является интернет-сверкой спроса.",
      "Built-in local forecast for intent, hook, CTR/trend potential, and CMS metadata draft. It is not live internet demand verification.",
    ),
  },
  {
    name: text("Риски и экспертная проверка", "Risk and expert review"),
    group: "primary",
    change: "added",
    description: text(
      "Встроенный риск-флаг для unsafe, юридически, медицински, научно, технически и расчетно чувствительных утверждений. Не заменяет эксперта.",
      "Built-in risk flag for unsafe, legal, medical, scientific, technical, and calculation-sensitive claims. It does not replace expert review.",
    ),
  },
  {
    name: text("Платформа текста", "Text platform"),
    group: "secondary",
    description: text(
      "Определяет, больше ли текст похож на статью сайта, пост или материал для другой площадки.",
      "Infers whether the text behaves like a site article, post, or another platform format.",
    ),
  },
  {
    name: text("Структура текста", "Text structure"),
    group: "secondary",
    description: text(
      "Проверяет объем, абзацы, заголовки, полноту и удобство сканирования.",
      "Checks length, paragraphs, headings, completeness, and scanability.",
    ),
  },
  {
    name: text("Стиль текста", "Text style"),
    group: "secondary",
    description: text(
      "Определяет стиль и проверяет, не звучит ли текст слишком сухо или механически.",
      "Infers style and checks whether the text sounds too dry or mechanical.",
    ),
  },
  {
    name: text("Соответствие тона", "Tone fit"),
    group: "secondary",
    description: text(
      "Проверяет, подходит ли тон теме, риску и выбранной площадке.",
      "Checks whether tone fits the topic, risk level, and selected platform.",
    ),
  },
  {
    name: text("Язык и аудитория", "Language and audience"),
    group: "secondary",
    description: text(
      "Проверяет, совпадают ли язык, примеры и уровень объяснения с аудиторией.",
      "Checks whether language, examples, and explanation depth fit the audience.",
    ),
  },
  {
    name: text("Размещение медиа", "Media placement"),
    group: "secondary",
    description: text(
      "Проверяет метки изображений, видео, анимации и аудио в структуре статьи.",
      "Reviews image, video, animation, and audio placeholders in the article structure.",
    ),
  },
  {
    name: text("Искажение фактов", "Fact distortion"),
    group: "additional",
    change: "added",
    description: text(
      "Дополнительная проверка точных цифр, категоричных утверждений и чувствительных фактов.",
      "Optional check for exact numbers, absolute claims, and sensitive factual statements.",
    ),
  },
  {
    name: text("Проверка наличия ИИ и его галлюцинаций", "AI and hallucination check"),
    group: "additional",
    change: "added",
    description: text(
      "Дополнительная проверка расплывчатых источников, выдуманных деталей и следов ИИ-черновика.",
      "Optional check for vague authorities, invented details, and AI-draft traces.",
    ),
  },
  {
    name: text("Ресурс", "Resource"),
    group: "choice",
    description: text(
      "Выбор площадки или своего ресурса, чтобы анализ учитывал контекст публикации.",
      "Platform or custom resource selector so the analysis can account for publishing context.",
    ),
  },
  {
    name: text("Стиль текста", "Text style selector"),
    group: "choice",
    description: text(
      "Выбор ожидаемого стиля или автоматическое определение стиля по тексту.",
      "Expected style selector or automatic style inference from the text.",
    ),
  },
  {
    name: text("Роль ИИ для анализа", "AI analysis role"),
    group: "choice",
    change: "added",
    description: text(
      "Необязательное поле: какую роль ИИ должен применить при анализе текста.",
      "Optional field: which reviewer role AI should use for text analysis.",
    ),
  },
];

const pageByUrlCurrent: CatalogToolRow[] = [
  ...siteByUrlCurrent.filter((row) =>
    ["Быстрое сканирование страницы", "Meta-теги", "Заголовки", "Контент страницы", "Технологический стек"].includes(
      row.name.ru,
    ),
  ),
  {
    name: text("Извлечение основного текста", "Main text extraction"),
    group: "secondary",
    change: "added",
    description: text(
      "Находит главный текстовый блок страницы для дальнейшего анализа статьи.",
      "Finds the main text block for further article analysis.",
    ),
  },
  {
    name: text("Платформа текста", "Text platform"),
    group: "secondary",
    change: "added",
    description: text(
      "Определяет тип и формат текста на странице.",
      "Infers the type and format of the text on the page.",
    ),
  },
  {
    name: text("Стиль текста", "Text style"),
    group: "secondary",
    change: "added",
    description: text("Проверяет стиль найденного текста.", "Checks the style of the extracted text."),
  },
  {
    name: text("Язык и аудитория", "Language and audience"),
    group: "secondary",
    change: "added",
    description: text(
      "Проверяет соответствие языка и аудитории страницы.",
      "Checks language and audience fit for the page.",
    ),
  },
];

const articleCompareCurrent: CatalogToolRow[] = [
  {
    name: text("Сравнение структуры", "Structure comparison"),
    group: "primary",
    change: "added",
    description: text("Сравнивает, как два текста раскрывают идею.", "Compares how two texts develop the idea."),
  },
  {
    name: text("Сравнение стиля", "Style comparison"),
    group: "primary",
    change: "added",
    description: text("Сравнивает тон, ритм и ясность двух текстов.", "Compares tone, rhythm, and clarity of two texts."),
  },
  {
    name: text("Сравнение под платформу", "Platform fit comparison"),
    group: "primary",
    change: "added",
    description: text(
      "Показывает, какой текст лучше подходит выбранной площадке.",
      "Shows which text better fits the selected platform.",
    ),
  },
  {
    name: text("Сильные и слабые стороны", "Strengths and weaknesses"),
    group: "secondary",
    change: "added",
    description: text("Выводит преимущества и слабые места рядом.", "Shows strengths and weak spots side by side."),
  },
  {
    name: text("Роль текста A/B", "Text A/B role"),
    group: "choice",
    change: "added",
    description: text(
      "Позволяет указать, где текст пользователя, а где конкурент или нейтральный вариант.",
      "Marks which text is the user's, competitor's, or neutral.",
    ),
  },
];

const siteCompareCurrent: CatalogToolRow[] = [
  {
    name: text("Сравнение позиционирования", "Positioning comparison"),
    group: "primary",
    change: "added",
    description: text("Сравнивает обещание, аудиторию и видимое предложение сайтов.", "Compares promise, audience, and visible offer."),
  },
  {
    name: text("Глубина контента", "Content depth"),
    group: "primary",
    change: "added",
    description: text("Сравнивает полноту и полезность контента.", "Compares content completeness and usefulness."),
  },
  {
    name: text("Техническая база", "Technical basics"),
    group: "secondary",
    change: "added",
    description: text("Сравнивает базовые технические SEO-сигналы.", "Compares basic technical SEO signals."),
  },
  {
    name: text("Сильные и слабые стороны", "Strengths and weaknesses"),
    group: "secondary",
    change: "added",
    description: text("Показывает преимущества и слабые места сайтов.", "Shows strengths and weak spots of the sites."),
  },
];

const siteDesignCurrent: CatalogToolRow[] = [
  {
    name: text("Визуальная иерархия", "Visual hierarchy"),
    group: "primary",
    change: "added",
    description: text("Планируемая проверка читаемости и приоритетов интерфейса.", "Planned check for readability and interface priorities."),
  },
  {
    name: text("Контентный UX", "Content UX"),
    group: "primary",
    change: "added",
    description: text("Планируемая проверка того, помогает ли контент пользователю двигаться дальше.", "Planned check of whether content helps users proceed."),
  },
  {
    name: text("Связь дизайна и контента", "Design-content alignment"),
    group: "secondary",
    change: "added",
    description: text("Планируемая проверка соответствия визуала смыслу страницы.", "Planned check for visual and content alignment."),
  },
  {
    name: text("Сигналы доверия", "Trust signals"),
    group: "secondary",
    change: "added",
    description: text("Планируемая проверка элементов доверия и убедительности.", "Planned check for trust and persuasion signals."),
  },
];

const archiveSiteByUrl: CatalogToolRow[] = siteByUrlCurrent
  .filter((row) => row.name.ru !== "Технологический стек")
  .map((row) => ({ ...row, change: "stable" as const }));

const archivePlanned = (name: string): CatalogToolRow[] => [
  {
    name: text("Черновой режим", "Draft mode"),
    group: "primary",
    description: text(
      `${name} был виден как будущий сценарий, но без полного набора инструментов анализа.`,
      `${name} was visible as a future scenario, but without a full analysis tool set.`,
    ),
  },
];

export const TOOL_CATALOG_VERSIONS: CatalogVersion[] = [
  {
    version: "0.0.9",
    label: text("v0.0.9 (актуальная)", "v0.0.9 (current)"),
    status: "current",
    sections: [
      { analysisType: "article_text", rows: articleTextCurrent },
      { analysisType: "article_compare", rows: articleCompareCurrent },
      { analysisType: "page_by_url", rows: pageByUrlCurrent },
      { analysisType: "site_by_url", rows: siteByUrlCurrent },
      { analysisType: "site_compare", rows: siteCompareCurrent },
      { analysisType: "site_design_by_url", rows: siteDesignCurrent },
    ],
  },
  {
    version: "0.0.7",
    label: text("v0.0.7 (архивная)", "v0.0.7 (archive)"),
    status: "archive",
    sections: [
      { analysisType: "article_text", rows: archivePlanned("Текст") },
      { analysisType: "article_compare", rows: archivePlanned("Сравнение текстов") },
      { analysisType: "page_by_url", rows: archivePlanned("Страница по URL") },
      { analysisType: "site_by_url", rows: archiveSiteByUrl },
      { analysisType: "site_compare", rows: archivePlanned("Сравнение сайтов") },
      { analysisType: "site_design_by_url", rows: archivePlanned("Дизайн и контент") },
    ],
  },
];
