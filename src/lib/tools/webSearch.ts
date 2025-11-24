import type { WebSearchFinding } from "@/lib/types";
import { search } from "duckduckgo-search";

const TAVILY_API_URL = "https://api.tavily.com/search";

type TavilyResponse = {
  results: Array<{
    title: string;
    url: string;
    content: string;
    published_date?: string;
    score?: number;
  }>;
};

export async function runWebSearch(
  query: string,
  { maxResults = 5 }: { maxResults?: number } = {},
): Promise<WebSearchFinding[]> {
  // 1. Try Tavily if Key exists
  const apiKey = process.env.TAVILY_API_KEY;
  if (apiKey) {
    try {
      const response = await fetch(TAVILY_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: maxResults,
          include_images: false,
          include_answer: false,
          search_depth: "basic",
        }),
      });

      if (response.ok) {
        const payload = (await response.json()) as TavilyResponse;
        return (payload.results ?? []).map((result) => ({
          title: result.title,
          url: result.url,
          snippet: result.content,
          publishedAt: result.published_date,
        }));
      }
      console.warn("Tavily search failed, falling back to DuckDuckGo.");
    } catch (error) {
      console.warn("Tavily search error, falling back to DuckDuckGo.", error);
    }
  }

  // 2. Fallback to DuckDuckGo
  try {
    const results = await search(query, {
      safeSearch: "moderate",
    });

    if (!results || results.results.length === 0) {
      return [];
    }

    return results.results.slice(0, maxResults).map((result: any) => ({
      title: result.title,
      url: result.url,
      snippet: result.description,
      publishedAt: undefined,
    }));
  } catch (error) {
    console.warn("DuckDuckGo search error", error);
    return [];
  }
}
