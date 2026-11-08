import { useLocation } from 'react-router'

// Renders the router's current query string, so a test can assert what a page wrote to the URL.
export function LocationProbe() {
  return <output data-testid="location-search">{useLocation().search}</output>
}

export function currentSearch(): URLSearchParams {
  return new URLSearchParams(document.querySelector('[data-testid="location-search"]')!.textContent ?? '')
}
