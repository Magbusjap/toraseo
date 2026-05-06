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
    name: text("Карта AI-фрагментов", "AI trace map"),
    group: "primary",
    change: "added",
    description: text(
      "Показывает локальные фрагменты с AI-похожими признаками: служебные переходы, формальные пассивы, повторы и слишком ровный ритм. Это не доказательство авторства.",
      "Maps local AI-like fragments: generic transitions, formal passives, repetition, and uniform rhythm. This is not proof of authorship.",
    ),
  },
  {
    name: text("Водность и шаблонность", "Genericness and watery text"),
    group: "primary",
    change: "added",
    description: text(
      "Ищет общие фразы, слабую конкретику, повторяющиеся понятия и места, где нужны пример, источник, число или практическое действие.",
      "Finds broad phrasing, weak specificity, repeated concepts, and places that need an example, source, number, or practical action.",
    ),
  },
  {
    name: text("Читаемость и сложность", "Readability and complexity"),
    group: "primary",
    change: "added",
    description: text(
      "Оценивает плотность предложений, длинные фразы и тяжёлые абзацы, которые мешают быстро понять текст.",
      "Reviews sentence density, long sentences, and heavy paragraphs that make the text harder to scan.",
    ),
  },
  {
    name: text("Очередь фактов на проверку", "Claim source queue"),
    group: "primary",
    change: "added",
    description: text(
      "Собирает утверждения, цифры и категоричные формулировки, которые редактору стоит проверить по источникам перед публикацией.",
      "Collects claims, numbers, and absolute wording that an editor should verify against sources before publication.",
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
    name: text("Определение платформы", "Platform detection"),
    group: "secondary",
    change: "added",
    description: text(
      "Определяет площадку и формат двух текстов, чтобы сравнение не было оторвано от контекста публикации.",
      "Detects the platform and text format so the comparison stays tied to publishing context.",
    ),
  },
  {
    name: text("Язык и аудитория", "Language and audience"),
    group: "secondary",
    change: "added",
    description: text(
      "Проверяет, совпадают ли язык, ясность и ожидаемая аудитория у обоих текстов.",
      "Checks whether language, clarity, and expected audience match across both texts.",
    ),
  },
  {
    name: text("Структура текста", "Text structure"),
    group: "primary",
    change: "added",
    description: text(
      "Сравнивает заголовки, абзацы, списки и каркас каждого текста как в обычном анализе текста.",
      "Compares headings, paragraphs, lists, and each text's article skeleton as in regular text analysis.",
    ),
  },
  {
    name: text("Стиль текста", "Text style"),
    group: "primary",
    change: "added",
    description: text(
      "Сравнивает тон, ритм, ясность, формальность и плотность примеров.",
      "Compares tone, rhythm, clarity, formality, and example density.",
    ),
  },
  {
    name: text("Соответствие тона", "Tone fit"),
    group: "secondary",
    change: "added",
    description: text(
      "Проверяет, подходит ли тон каждого текста теме, риску и выбранной площадке.",
      "Checks whether each text's tone fits the topic, risk level, and selected platform.",
    ),
  },
  {
    name: text("Размещение медиа", "Media placement"),
    group: "secondary",
    change: "added",
    description: text(
      "Сравнивает, где в текстах нужны изображения, видео, анимации или аудио-маркеры.",
      "Compares where images, videos, animations, or audio markers may be needed.",
    ),
  },
  {
    name: text("Уникальность статьи", "Article uniqueness"),
    group: "secondary",
    change: "added",
    description: text(
      "Проверяет локальные совпадения и сигналы риска копирования между двумя текстами.",
      "Checks local overlap and copying-risk signals between the two texts.",
    ),
  },
  {
    name: text("Синтаксис языка", "Language syntax"),
    group: "secondary",
    change: "added",
    description: text(
      "Сравнивает локальные синтаксические и пунктуационные риски в обоих текстах.",
      "Compares local syntax and punctuation risks across both texts.",
    ),
  },
  {
    name: text("Вероятность написания ИИ", "AI writing probability"),
    group: "secondary",
    change: "added",
    description: text(
      "Сравнивает механичность, повторяемость и универсальные служебные обороты.",
      "Compares mechanical phrasing, repetition, and generic filler signals.",
    ),
  },
  {
    name: text("Естественность", "Naturalness"),
    group: "secondary",
    change: "added",
    description: text(
      "Проверяет, какой текст звучит естественнее и где нужны живые примеры или авторский опыт.",
      "Checks which text sounds more natural and where real examples or author experience are needed.",
    ),
  },
  {
    name: text("Проверка логики", "Logic check"),
    group: "secondary",
    change: "added",
    description: text(
      "Сравнивает причинно-следственные связки и места, где утверждения требуют ручной проверки.",
      "Compares cause-effect links and claims that need manual review.",
    ),
  },
  {
    name: text("Искажение фактов", "Fact distortion"),
    group: "additional",
    change: "added",
    description: text(
      "Дополнительная проверка рискованных утверждений, цифр и категоричных формулировок.",
      "Additional check for risky claims, numbers, and absolute wording.",
    ),
  },
  {
    name: text("Проверка наличия ИИ и его галлюцинаций", "AI and hallucination check"),
    group: "additional",
    change: "added",
    description: text(
      "Дополнительная проверка расплывчатых источников, выдуманных деталей и AI-следов.",
      "Additional check for vague authorities, invented details, and AI traces.",
    ),
  },
  {
    name: text("Прогноз интента и продвижения", "Intent and promotion forecast"),
    group: "secondary",
    change: "added",
    description: text(
      "Сравнивает соответствие интенту, SEO-направление, заголовок и мета-пакет как текстовые сигналы.",
      "Compares intent fit, SEO direction, headline, and metadata package as text signals.",
    ),
  },
  {
    name: text("Проверка рисков", "Risk review"),
    group: "secondary",
    change: "added",
    description: text(
      "Отмечает чувствительные темы, где нужны источники, осторожные формулировки или экспертная проверка.",
      "Flags sensitive topics where sources, caveats, or expert review are needed.",
    ),
  },
  {
    name: text("Сравнение интента", "Intent comparison"),
    group: "primary",
    change: "added",
    description: text(
      "Проверяет, отвечают ли оба текста на один и тот же запрос или сравниваются разные задачи.",
      "Checks whether both texts answer the same request or compare different tasks.",
    ),
  },
  {
    name: text("Сравнение структуры", "Structure comparison"),
    group: "primary",
    change: "added",
    description: text("Сравнивает путь читателя: вступление, объяснение, шаги, примеры, FAQ и вывод.", "Compares the reader path: intro, explanation, steps, examples, FAQ, and conclusion."),
  },
  {
    name: text("Разрывы по содержанию", "Content Gap"),
    group: "primary",
    change: "added",
    description: text(
      "Находит темы, разделы и полезные блоки, которые есть в одном тексте и отсутствуют в другом.",
      "Finds topics, sections, and useful blocks present in one text and missing in the other.",
    ),
  },
  {
    name: text("Смысловое покрытие", "Semantic coverage"),
    group: "primary",
    change: "added",
    description: text(
      "Сравнивает сущности, понятия, подтемы и смысловые связи двух текстов.",
      "Compares entities, concepts, subtopics, and semantic links across both texts.",
    ),
  },
  {
    name: text("Сравнение конкретики", "Specificity comparison"),
    group: "primary",
    change: "added",
    description: text(
      "Сравнивает примеры, цифры, шаги, сценарии и практическую пользу.",
      "Compares examples, numbers, steps, scenarios, and practical usefulness.",
    ),
  },
  {
    name: text("Сравнение доверия", "Trust comparison"),
    group: "primary",
    change: "added",
    description: text(
      "Сравнивает источники, осторожные формулировки, предупреждения и опасные советы.",
      "Compares sources, caveats, warnings, and risky advice.",
    ),
  },
  {
    name: text("Сравнение стиля", "Style comparison"),
    group: "primary",
    change: "added",
    description: text("Сравнивает стиль без копирования фраз: длину предложений, обращение к читателю и формальность.", "Compares style without copying phrasing: sentence length, reader address, and formality."),
  },
  {
    name: text("Риск похожести", "Similarity risk"),
    group: "primary",
    change: "added",
    description: text(
      "Разделяет дословные совпадения, смысловую близость и риск копирования.",
      "Separates exact overlap, semantic closeness, and copying risk.",
    ),
  },
  {
    name: text("Заголовок и клик", "Title and click"),
    group: "primary",
    change: "added",
    description: text(
      "Сравнивает точность заголовка, обещание пользы, интент и потенциальную кликабельность.",
      "Compares headline precision, benefit promise, intent fit, and click potential.",
    ),
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
    group: "primary",
    change: "added",
    description: text("Выводит сильные и слабые стороны A/B или фокусируется на нужном тексте по цели анализа.", "Shows A/B strengths and weaknesses or focuses on the target text by analysis goal."),
  },
  {
    name: text("План улучшения", "Improvement plan"),
    group: "primary",
    change: "added",
    description: text(
      "Собирает план усиления нужного текста без копирования второго.",
      "Builds a plan to strengthen the target text without copying the other one.",
    ),
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
