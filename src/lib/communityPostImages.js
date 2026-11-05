export function communityPostImages(post) {
  const imageUrls = Array.isArray(post?.image_urls)
    ? post.image_urls.filter((url) => typeof url === "string" && url.trim())
    : [];
  const legacyImage = typeof post?.image_url === "string" && post.image_url.trim()
    ? post.image_url
    : null;

  return [...new Set([...imageUrls, ...(legacyImage ? [legacyImage] : [])])];
}
