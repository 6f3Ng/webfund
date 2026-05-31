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

/** 获取历史净值（分页拉取，覆盖 start~end 区间）。
 *  注意：天天基金 lsjz 接口实际最大每页 20 条（忽略更大的 pageSize），
 *  因此用 TotalCount 驱动翻页，而非以"返回不足一页"判断结束。 */
export async function fetchEastmoneyHistory(
  code: string,
  start: string,
  end: string,
): Promise<NavPointDTO[]> {
  const pageSize = 20; // 接口硬上限
  const all: NavPointDTO[] = [];
  let total = Infinity;
  // 上限保护：最多 80 页（1600 条 ≈ 6.5 年交易日）
  for (let pageIndex = 1; pageIndex <= 80; pageIndex++) {
    const url =
      `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}` +
      `&pageIndex=${pageIndex}&pageSize=${pageSize}&startDate=${start}&endDate=${end}`;
    const resp = await fetchJson<LsjzResponse>(url, {
      headers: { Referer: 'https://fundf10.eastmoney.com/' },
    });
    if (Number.isFinite(resp.TotalCount)) total = resp.TotalCount as number;
    const points = parseLsjz(resp);
    all.push(...points);
    if (all.length >= total || points.length === 0) break;
  }
  // 去重并按日期升序
  const map = new Map(all.map((p) => [p.date, p]));
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
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
