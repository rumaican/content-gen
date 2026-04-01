/**
 * Content Router — routes content to appropriate platforms
 */
export async function routeContent(summary: string): Promise<string[]> {
  // Returns list of platforms: ['twitter', 'linkedin', 'instagram', 'email']
  const routes: string[] = [];
  
  if (summary.length > 0) {
    routes.push('twitter');
    if (summary.length > 100) routes.push('linkedin');
  }
  
  return routes;
}
