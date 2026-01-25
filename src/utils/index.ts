import { getCollection } from "astro:content"
import type { CollectionEntry } from "astro:content"

export const formatDate = (
  date: Date | string | undefined,
  format: string = "YYYY-MM-DD",
): string => {
  const validDate = date ? new Date(date) : new Date()

  // return empty string for invalid dates
  if (isNaN(validDate.getTime())) return ""

  const tokens: Record<string, string> = {
    YYYY: String(validDate.getFullYear()),
    MM: String(validDate.getMonth() + 1).padStart(2, "0"),
    DD: String(validDate.getDate()).padStart(2, "0"),
    HH: String(validDate.getHours()).padStart(2, "0"),
    mm: String(validDate.getMinutes()).padStart(2, "0"),
    ss: String(validDate.getSeconds()).padStart(2, "0"),
  }

  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (match) =>
    tokens[match as keyof typeof tokens] ?? match
  )
}

type PostEntry = CollectionEntry<"posts">
type WritingEntry = CollectionEntry<"writings">
type ProjectEntry = CollectionEntry<"projects">

export const getAllPosts = async (): Promise<PostEntry[]> => {
  const posts = await getCollection("posts")
  return posts.sort(
    (a, b) =>
      new Date(b.data.pubDate).getTime() - new Date(a.data.pubDate).getTime(),
  )
}

export const getAllWritings = async(): Promise<WritingEntry[]> => {
    const writings = await getCollection("writings")
    return writings.sort(
        (a, b) =>
          new Date(b.data.pubDate).getTime() - new Date(a.data.pubDate).getTime(),
    )
}

export const getAllProjects = async(): Promise<ProjectEntry[]> => {
    const writings = await getCollection("projects")
    return writings.sort(
        (a, b) =>
          new Date(b.data.pubDate).getTime() - new Date(a.data.pubDate).getTime(),
    )
}
