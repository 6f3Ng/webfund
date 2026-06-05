import type { ValuationDTO, NavPointDTO, FundInfoDTO } from '../dto';
import { fetchText, fetchJson, UpstreamError } from '../lib/fetch';

/**
 * 天天基金（东方财富）数据适配。
 * 数据来自公开网络接口，非官方，仅供参考。
 */

interface EastmoneyGzPayload {
  fundcode: string;
  name: string;
  jzrq: string; // 上一净值日期
  dwjz: string; // 上一单位净值
  gsz: string; // 估算净值
  gszzl: string; // 估算涨跌幅 %
  gztime: string; // 估值时间
}

/** 解析 JSONP：jsonpgz({...}); */
export function parseGzJsonp(text: string): EastmoneyGzPayload {
  const match = /jsonpgz\((.*)\)/s.exec(text.trim());
  if (!match || !match[1]) {
    throw new UpstreamError(502, '天天基金估值响应格式异常');
  }
  return JSON.parse(match[1]) as EastmoneyGzPayload;
}

export function toValuationDTO(p: EastmoneyGzPayload): ValuationDTO {
  return {
    fundCode: p.fundcode,
    name: p.name,
    source: 'eastmoney',
    estimatedNav: Number(p.gsz),
    estimatedGrowthPct: Number(p.gszzl),
    estimatedAt: p.gztime,
    baseNav: Number(p.dwjz),
    baseNavDate: p.jzrq,
  };
}

/** 获取单只基金估值 */
export async function fetchEastmoneyValuation(code: string): Promise<ValuationDTO> {
  const url = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
  const text = await fetchText(url, { headers: { Referer: 'https://fund.eastmoney.com/' } });
  return toValuationDTO(parseGzJsonp(text));
}

interface LsjzItem {
  FSRQ: string; // 净值日期
  DWJZ: string; // 单位净值
  LJJZ: string; // 累计净值
  JZZZL: string; // 涨跌幅
}
interface LsjzResponse {
  Data?: { LSJZList?: LsjzItem[] };
  TotalCount?: number;
}

export function parseLsjz(resp: LsjzResponse): NavPointDTO[] {
  const list = resp.Data?.LSJZList ?? [];
  return list
    .map((it) => ({
      date: it.FSRQ,
      nav: Number(it.DWJZ),
      accNav: it.LJJZ ? Number(it.LJJZ) : undefined,
      growthPct: it.JZZZL ? Number(it.JZZZL) : undefined,
    }))
    .filter((p) => p.date && Number.isFinite(p.nav))
    .sort((a, b) => (a.date < b.date ? -1 : 1)); // 升序
}

/** 把东方财富的毫秒时间戳（UTC 0 点对应北京时间当日）转为 YYYY-MM-DD（北京时间）。 */
export function tsToDate(ts: number): string {
  return new Date(ts + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

interface NetWorthItem {
  x: number; // 毫秒时间戳
  y: number; // 单位净值
  equityReturn?: number; // 当日涨跌幅 %
}

/** 从 pingzhongdata.js 文本中提取某个 `var Name = [...];` 的 JSON 数组字面量。 */
function extractArrayVar(text: string, name: string): string | null {
  const re = new RegExp(`var\\s+${name}\\s*=\\s*(\\[[\\s\\S]*?\\]);`);
  const m = re.exec(text);
  return m ? m[1] : null;
}

/**
 * 解析 pingzhongdata.js（一次请求即含全部历史净值），合并单位净值趋势与累计净值趋势。
 * - Data_netWorthTrend: [{x: ts, y: 单位净值, equityReturn: 当日涨跌幅%}]
 * - Data_ACWorthTrend:   [[ts, 累计净值]]
 * 返回按日期升序、可选按 [start,end] 过滤后的标准净值点。
 */
export function parsePingzhongHistory(text: string, start?: string, end?: string): NavPointDTO[] {
  const nwRaw = extractArrayVar(text, 'Data_netWorthTrend');
  if (!nwRaw) {
    throw new UpstreamError(502, '天天基金历史净值响应格式异常');
  }
  const netWorth = JSON.parse(nwRaw) as NetWorthItem[];

  // 累计净值：按时间戳建索引（可能缺失，不影响单位净值）
  const accByTs = new Map<number, number>();
  const acRaw = extractArrayVar(text, 'Data_ACWorthTrend');
  if (acRaw) {
    const ac = JSON.parse(acRaw) as [number, number][];
    for (const [ts, acc] of ac) accByTs.set(ts, acc);
  }

  return netWorth
    .map((it) => {
      const acc = accByTs.get(it.x);
      return {
        date: tsToDate(it.x),
        nav: Number(it.y),
        accNav: Number.isFinite(acc) ? acc : undefined,
        growthPct: typeof it.equityReturn === 'number' ? it.equityReturn : undefined,
      };
    })
    .filter((p) => p.date && Number.isFinite(p.nav))
    .filter((p) => (!start || p.date >= start) && (!end || p.date <= end))
    .sort((a, b) => (a.date < b.date ? -1 : 1)); // 升序
}

/**
 * 获取历史净值，覆盖 start~end 区间。
 *
 * 采用 pingzhongdata.js 接口：**单次请求**即返回基金全部历史净值，再在内存中按区间过滤。
 * 这从根因上规避了原 lsjz 分页方案（每页仅 20 条、大区间需数十次翻页）在 Cloudflare Workers
 * 单次调用下触发 "Too many subrequests"（子请求数上限）限制——尤其当回测/选基选择
 * 5 年以上区间时稳定触发。一次请求即可覆盖十余年历史。
 */
export async function fetchEastmoneyHistory(
  code: string,
  start: string,
  end: string,
): Promise<NavPointDTO[]> {
  const url = `https://fund.eastmoney.com/pingzhongdata/${code}.js?v=${Date.now()}`;
  const text = await fetchText(url, { headers: { Referer: 'https://fund.eastmoney.com/' } });
  return parsePingzhongHistory(text, start, end);
}

interface FundSearchResp {
  Datas?: { CODE: string; NAME: string; CATEGORYDESC?: string }[];
}

/** 获取基金基础信息（用搜索接口） */
export async function fetchEastmoneyFundInfo(code: string): Promise<FundInfoDTO> {
  const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${code}`;
  try {
    const resp = await fetchJson<FundSearchResp>(url);
    const hit = resp.Datas?.find((d) => d.CODE === code) ?? resp.Datas?.[0];
    if (hit) {
      return { code: hit.CODE, name: hit.NAME, type: hit.CATEGORYDESC };
    }
  } catch {
    // 退化：从估值接口取名称
  }
  const val = await fetchEastmoneyValuation(code);
  return { code, name: val.name ?? code };
}
