import { ui, defaultLang, showDefaultLang, languages, type SupportedLanguage, type TranslationKey } from "./ui";

/**
 * Extracts language code from the current URL path.
 * Supports: /es/, /ja/..., and defaults to defaultLang ('en') when at root.
 */
export function getLangFromUrl(url: URL): SupportedLanguage {
  const segments = url.pathname.split("/").filter(Boolean);
  const potentialLang = segments[0] as SupportedLanguage;
  if (potentialLang && potentialLang in ui) {
    return potentialLang;
  }
  return defaultLang;
}

/**
 * Translation helper for localized UI strings with fallback to default language.
 */
export function useTranslations(lang: SupportedLanguage) {
  const localizedUI = ui[lang] || ui[defaultLang];
  return function t(key: TranslationKey): string {
    if (key in localizedUI) {
      return (localizedUI as Record<string, string>)[key];
    }
    return (ui[defaultLang] as Record<string, string>)[key] || (key as string);
  };
}

/**
 * Returns clean path without language prefix.
 * e.g. "/es/about/" -> "/about", "/ja/" -> "/"
 */
export function getCleanPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length > 0 && segments[0] in languages) {
    segments.shift();
  }
  const clean = "/" + segments.join("/");
  return clean === "/" ? "/" : clean;
}

/**
 * Generates localized path for a given path and target language.
 */
export function useTranslatedPath(lang: SupportedLanguage) {
  return function translatePath(path: string, targetLang: SupportedLanguage = lang): string {
    const clean = getCleanPath(path);
    if (!showDefaultLang && targetLang === defaultLang) {
      return clean;
    }
    // For non-default languages, prefix with /{lang}
    if (clean === "/") {
      return `/${targetLang}/`;
    }
    return `/${targetLang}${clean.endsWith("/") ? clean : clean + "/"}`;
  };
}

export interface HreflangEntry {
  lang: string;
  hreflang: string;
  href: string;
}

/**
 * Returns hreflang link alternatives for search engines (Google, Bing, etc.)
 */
export function getHreflangList(url: URL, siteUrl = "https://piechartmakerfree.com"): HreflangEntry[] {
  const cleanPath = getCleanPath(url.pathname);
  const base = siteUrl.replace(/\/+$/, "");

  const entries: HreflangEntry[] = [];

  // x-default points to default language (English at root)
  const defaultPath = cleanPath === "/" ? "/" : `${cleanPath.endsWith("/") ? cleanPath : cleanPath + "/"}`;
  entries.push({
    lang: defaultLang,
    hreflang: "x-default",
    href: `${base}${defaultPath}`,
  });

  // Entry for each supported language
  (Object.keys(languages) as SupportedLanguage[]).forEach((langCode) => {
    let localizedPath = "";
    if (langCode === defaultLang && !showDefaultLang) {
      localizedPath = defaultPath;
    } else {
      localizedPath = cleanPath === "/" ? `/${langCode}/` : `/${langCode}${cleanPath.endsWith("/") ? cleanPath : cleanPath + "/"}`;
    }

    entries.push({
      lang: langCode,
      hreflang: langCode,
      href: `${base}${localizedPath}`,
    });
  });

  return entries;
}

/**
 * Returns the canonical URL for the current page.
 */
export function getCanonicalUrl(url: URL, siteUrl = "https://piechartmakerfree.com"): string {
  const base = siteUrl.replace(/\/+$/, "");
  const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return `${base}${path === "//" ? "/" : path}`;
}
