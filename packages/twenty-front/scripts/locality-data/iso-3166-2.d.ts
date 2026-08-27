// `iso-3166-2` ships no types. Only the two members the dataset generator uses
// are declared here.
declare module 'iso-3166-2' {
  type Subdivision = {
    name: string;
    type: string;
    countryName: string;
    countryCode: string;
    code: string;
    regionCode: string;
  };

  type Country = {
    name: string;
    sub: Record<string, Subdivision>;
  };

  const iso31662: {
    subdivision: (code: string) => Subdivision | null;
    country: (code: string) => Country | null;
  };

  export default iso31662;
}
