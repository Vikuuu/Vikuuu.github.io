import { glob } from "astro/loaders"
import { defineCollection, z } from "astro:content"

const postSchema = z.object({
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  heroImage: z.string().optional(),
  ogImage: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

const writingSchema = z.object({
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  heroImage: z.string().optional(),
  ogImage: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

const projectSchema = z.object({
  title: z.string(),
  description: z.string(),
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  heroImage: z.string().optional(),
  ogImage: z.string().optional(),
  tags: z.array(z.string()).optional(),
  top: z.boolean().optional(),
})

const PostsCollection = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "src/content/posts/" }),
  schema: postSchema,
})

const WritingsCollection = defineCollection({
    loader: glob({pattern: "**/*.{md,mdx}", base: "src/content/writings/"}),
    schema: writingSchema,
})

const ProjectsCollection = defineCollection({
    loader: glob({pattern: "**/*.{md,mdx}", base: "src/content/projects/"}),
    schema: projectSchema,
})

export const collections = { 
    posts: PostsCollection,
    writings: WritingsCollection,
    projects: ProjectsCollection,
}
