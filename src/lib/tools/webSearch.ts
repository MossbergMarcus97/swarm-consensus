import type { WebSearchFinding } from "@/lib/types";

const TAVILY_API_URL = "https://api.tavily.com/search";

// DuckDuckGo search using the duckduckgo-search package
// The package exports a SearchApi instance with async generator methods
async function duckDuckGoSearch(query: string, options: { safeSearch?: string } = {}, maxResults = 5) {
  try {
    // The package exports a SearchApi instance directly
    const ddg = await import("duckduckgo-search");
    const searchApi = ddg.default || ddg;
    
    // The text() method is an async generator
    if (typeof searchApi.text !== "function") {
      throw new Error("duckduckgo-search module does not have text() method");
    }
    
    const results: Array<{ title: string; href: string; body: string }> = [];
    const generator = searchApi.text(query, "wt-wt", options.safeSearch || "moderate");
    
    // Collect results from the async generator
    for await (const result of generator) {
      results.push(result);
      if (results.length >= maxResults) {
        break;
      }
    }
    
    return { results };
  } catch (error) {
    throw error;
  }
}

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
    const results = await duckDuckGoSearch(query, {
      safeSearch: "moderate",
    }, maxResults);

    if (!results || !results.results || results.results.length === 0) {
      return [];
    }

    return results.results.map((result: any) => ({
      title: result.title,
      url: result.href,  // DuckDuckGo package uses 'href' not 'url'
      snippet: result.body,  // DuckDuckGo package uses 'body' not 'description'
      publishedAt: undefined,
    }));
  } catch (error) {
    console.warn("DuckDuckGo search error", error);
    return [];
  }
}
