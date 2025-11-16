import type { WebSearchFinding } from "@/lib/types";

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
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn("TAVILY_API_KEY is not set. Skipping web search.");
    return [];
  }

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
        search_depth: "advanced",
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      console.warn("Tavily search failed", body);
      return [];
    }

    const payload = (await response.json()) as TavilyResponse;
    return (payload.results ?? []).map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.content,
      publishedAt: result.published_date,
    }));
  } catch (error) {
    console.warn("Web search error", error);
    return [];
  }
}


