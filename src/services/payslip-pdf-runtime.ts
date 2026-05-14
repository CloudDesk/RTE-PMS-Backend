import fs from 'fs';
import * as fsPromises from 'fs/promises';
import path from 'path';
import puppeteer, { Browser, Page, PDFOptions } from 'puppeteer';
import { getPuppeteerRuntimeConfig } from '../utilis/puppeteer';

interface PayslipRuntimeLogContext {
    userId: string;
    month: number;
    year: number;
}

interface RenderPayslipPdfParams {
    logContext: PayslipRuntimeLogContext;
    outputPath: string;
    renderPage: (page: Page) => Promise<Omit<PDFOptions, 'path'>>;
}

interface BrowserSession {
    browser: Browser;
    transient: boolean;
}

let browserInstance: Browser | null = null;
let browserPromise: Promise<Browser> | null = null;
let launchPathLogged = false;
let activeRenderCount = 0;
const renderQueue: Array<() => void> = [];

function logRuntime(level: 'info' | 'warn' | 'error', step: string, context: Partial<PayslipRuntimeLogContext>, extra?: Record<string, unknown>): void {
    const payload = {
        scope: 'payslip_pdf_runtime',
        level,
        step,
        ...context,
        ...(extra || {})
    };

    const message = JSON.stringify(payload);
    if (level === 'error') {
        console.error(message);
        return;
    }

    if (level === 'warn') {
        console.warn(message);
        return;
    }

    console.log(message);
}

function getRuntimeConfig() {
    return getPuppeteerRuntimeConfig();
}

async function safeClosePage(page: Page, context: PayslipRuntimeLogContext): Promise<void> {
    try {
        if (!page.isClosed()) {
            await page.close();
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logRuntime('warn', 'close_page', context, { message });
    }
}

function createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`PDF generation timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        timeout.unref?.();
    });
}

async function acquireRenderSlot(context: PayslipRuntimeLogContext): Promise<() => void> {
    const { maxConcurrentPdfRenders } = getRuntimeConfig();

    if (activeRenderCount >= maxConcurrentPdfRenders) {
        logRuntime('info', 'wait_for_render_slot', context, {
            activeRenderCount,
            maxConcurrentPdfRenders
        });

        await new Promise<void>((resolve) => {
            renderQueue.push(resolve);
        });
    }

    activeRenderCount += 1;

    return () => {
        activeRenderCount = Math.max(0, activeRenderCount - 1);
        const next = renderQueue.shift();
        if (next) {
            next();
        }
    };
}

export async function resetPayslipBrowser(): Promise<void> {
    const browserToClose = browserInstance;
    browserInstance = null;
    browserPromise = null;

    if (!browserToClose) {
        return;
    }

    try {
        if (browserToClose.isConnected()) {
            await browserToClose.close();
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logRuntime('warn', 'reset_browser', {}, { message });
    }
}

async function getBrowser(context: PayslipRuntimeLogContext): Promise<Browser> {
    const runtimeConfig = getRuntimeConfig();

    if (!runtimeConfig.browserReuse) {
        try {
            return await puppeteer.launch(runtimeConfig.launchOptions);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logRuntime('error', 'launch_browser', context, { message });
            throw error;
        }
    }

    if (browserInstance && !browserInstance.isConnected()) {
        logRuntime('warn', 'browser_disconnected_before_reuse', context);
        await resetPayslipBrowser();
    }

    if (browserInstance) {
        return browserInstance;
    }

    if (!browserPromise) {
        const { launchOptions, executablePath } = runtimeConfig;

        if (!launchPathLogged) {
            logRuntime('info', 'browser_launch_config', context, {
                executablePath: executablePath || 'puppeteer-managed-browser',
                browserReuse: runtimeConfig.browserReuse,
                navigationTimeoutMs: runtimeConfig.navigationTimeoutMs,
                defaultTimeoutMs: runtimeConfig.defaultTimeoutMs,
                pdfTimeoutMs: runtimeConfig.pdfTimeoutMs,
                maxConcurrentPdfRenders: runtimeConfig.maxConcurrentPdfRenders,
                tempDir: runtimeConfig.tempDir
            });
            launchPathLogged = true;
        }

        browserPromise = puppeteer.launch(launchOptions)
            .then((browser) => {
                browserInstance = browser;
                browser.on('disconnected', () => {
                    logRuntime('warn', 'browser_disconnected', context);
                    browserInstance = null;
                    browserPromise = null;
                });
                return browser;
            })
            .catch((error) => {
                browserInstance = null;
                browserPromise = null;
                const message = error instanceof Error ? error.message : String(error);
                logRuntime('error', 'launch_browser', context, { message });
                throw error;
            });
    }

    return browserPromise;
}

async function getBrowserSession(context: PayslipRuntimeLogContext): Promise<BrowserSession> {
    const runtimeConfig = getRuntimeConfig();
    const browser = await getBrowser(context);
    return {
        browser,
        transient: !runtimeConfig.browserReuse
    };
}

export async function getPayslipTempFilePath(fileName: string): Promise<string> {
    const { tempDir } = getRuntimeConfig();
    await fsPromises.mkdir(tempDir, { recursive: true });
    return path.join(tempDir, fileName);
}

export async function logPayslipTempFileStats(filePath: string, context: PayslipRuntimeLogContext): Promise<void> {
    try {
        const stats = await fsPromises.stat(filePath);
        logRuntime('info', 'temp_file_stats', context, {
            filePath,
            sizeBytes: stats.size
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logRuntime('warn', 'temp_file_stats', context, { filePath, message });
    }
}

export async function cleanupPayslipTempFile(filePath: string, context: PayslipRuntimeLogContext): Promise<void> {
    try {
        if (fs.existsSync(filePath)) {
            await fsPromises.unlink(filePath);
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logRuntime('warn', 'cleanup_temp_file', context, { filePath, message });
    }
}

export async function renderPayslipPdf(params: RenderPayslipPdfParams): Promise<void> {
    const { logContext, outputPath, renderPage } = params;
    const releaseSlot = await acquireRenderSlot(logContext);
    let page: Page | null = null;
    let browserSession: BrowserSession | null = null;

    try {
        browserSession = await getBrowserSession(logContext);
        const runtimeConfig = getRuntimeConfig();

        const createPageStartedAt = Date.now();
        page = await browserSession.browser.newPage();
        logRuntime('info', 'create_page', logContext, {
            durationMs: Date.now() - createPageStartedAt
        });

        page.setDefaultNavigationTimeout(runtimeConfig.navigationTimeoutMs);
        page.setDefaultTimeout(runtimeConfig.defaultTimeoutMs);

        page.on('error', (error) => {
            const message = error instanceof Error ? error.message : String(error);
            logRuntime('error', 'page_error', logContext, { message });
            void safeClosePage(page!, logContext);
        });

        page.on('pageerror', (error) => {
            const message = error instanceof Error ? error.message : String(error);
            logRuntime('error', 'page_runtime_error', logContext, { message });
            void safeClosePage(page!, logContext);
        });

        const pdfOptions = await renderPage(page);
        const renderPdfStartedAt = Date.now();
        await Promise.race([
            page.pdf({
                ...pdfOptions,
                path: outputPath
            }),
            createTimeoutPromise(runtimeConfig.pdfTimeoutMs)
        ]);
        logRuntime('info', 'render_pdf', logContext, {
            durationMs: Date.now() - renderPdfStartedAt
        });
    } finally {
        if (page) {
            await safeClosePage(page, logContext);
        }
        if (browserSession?.transient) {
            try {
                await browserSession.browser.close();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                logRuntime('warn', 'close_transient_browser', logContext, { message });
            }
        }
        releaseSlot();
    }
}
