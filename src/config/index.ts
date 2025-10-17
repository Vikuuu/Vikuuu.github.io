import { Github } from "lucide-react"

export const defaultLanguage: string = "en"

export const common = {
  domain: "https://vikuuu.github.io",
  meta: {
    favicon: "/avatar.png",
    url: "https://vikuuu.github.io",
  },
  googleAnalyticsId: "",
  social: [
    {
      icon: Github,
      label: "GitHub",
      link: "https://github.com/Vikuuu",
    },
  ],
  rss: true,
  navigation: {
    home: true,
    archive: true,
    writings: true,
    about: true,
  },
  latestPosts: 5,
  comments: {
    enabled: true,
    twikoo: {
      enabled: true,
      // replace with your own envId
      envId: import.meta.env.PUBLIC_TWIKOO_ENV_ID ?? "",
    },
  },
}

export const en = {
  ...common,
  siteName: "Just Build it...",
  meta: {
    ...common.meta,
    title: "Just Build it...",
    slogan: "Reinventing the wheel...?",
    description: "Reading, Photography, Programming, Traveling",
  },
  navigation: {
    ...common.navigation,
  },
  pageMeta: {
    archive: {
      title: "All Posts",
      description: "Here are all the posts",
      ogImage: "/images/page-meta/en/archive.png",
    },
    writings: {
      title: "Writings",
      description: "Here are all my writings",
      ogImage: "",
    },
    about: {
      title: "About Me",
      description: "Here is Guoqi Sun's self-introduction",
      ogImage: "/images/page-meta/en/about.png",
    },
  },
}
