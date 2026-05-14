declare module '*.hbs' {
  const content: string;
  export default content;
}

declare module 'handlebars' {
  export interface TemplateDelegate<T = any> {
    (context: T, options?: RuntimeOptions): string;
  }

  export interface RuntimeOptions {
    partial?: boolean;
    depths?: any[];
    helpers?: { [name: string]: Function };
    partials?: { [name: string]: HandlebarsTemplateDelegate };
    decorators?: { [name: string]: Function };
    data?: any;
  }

  export interface HandlebarsTemplateDelegate<T = any> {
    (context: T, options?: RuntimeOptions): string;
  }

  export function compile<T = any>(template: string, options?: CompileOptions): HandlebarsTemplateDelegate<T>;
  export function registerPartial(name: string, partial: HandlebarsTemplateDelegate | string): void;
  export function registerHelper(name: string, helper: Function): void;
  export function registerDecorator(name: string, decorator: Function): void;

  export interface CompileOptions {
    data?: boolean;
    compat?: boolean;
    knownHelpersOnly?: boolean;
    preventIndent?: boolean;
    ignoreStandalone?: boolean;
    explicitPartialContext?: boolean;
    strict?: boolean;
    assumeObjects?: boolean;
    noEscape?: boolean;
    escapeExpression?: (value: any) => string;
    isSimple?: (value: any) => boolean;
  }
} 