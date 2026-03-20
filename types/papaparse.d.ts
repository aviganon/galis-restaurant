declare module "papaparse" {
  export interface ParseConfig<T = unknown> {
    header?: boolean
    skipEmptyLines?: boolean
    complete?: (results: { data: T[] }) => void
  }
  export function parse<T = unknown>(input: File, config: ParseConfig<T>): void
}
