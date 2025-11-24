import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseJsonFromModel<T>(text: string | undefined | null, fallback: T): T {
  if (!text) return fallback;

  // 1. Remove markdown code blocks (```json ... ``` or just ``` ... ```)
  let cleanText = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, "$1");

  // 2. Trim whitespace
  cleanText = cleanText.trim();

  // 3. Attempt simple parse
  try {
    return JSON.parse(cleanText) as T;
  } catch (e) {
    // 4. Sometimes models return valid JSON but with some prefix/suffix text outside the code block
    // If the regex didn't catch it (e.g. no code blocks), try to find the first '{' and last '}'
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
       const potentialJson = cleanText.substring(firstBrace, lastBrace + 1);
       try {
         return JSON.parse(potentialJson) as T;
       } catch {
         // Fall through
       }
    }
    
    return fallback;
  }
}