import type { ValuationDTO, NavPointDTO } from '../dto';
import { fetchJson, UpstreamError } from '../lib/fetch';

/**
 * 蛋卷基金（雪球）数据适配。
 * 注意：蛋卷的"盘中实时估值"接口需要登录，公开可得的是 derived 接口（最近确认净值）。
 * 因此本数据源的估值反映"最近一个交易日确认净值"，而非盘中估算，
 * 适合与天天基金的盘中估值做对比/容灾。数据来自公开网络，非官方。
 */

interface DanjuanDerived {
  fd_code: string;
  end_date: string; // 最近净值日期
  unit_nav: string; // 单位净值
  unit_acc_nav: string; // 累计净值
  nav_grtd: string; // 最近一日涨跌幅 %
}
interface DanjuanDerivedResp {
  data?: DanjuanDerived;
  result_code?: number;
}

export function toValuationDTO(d: DanjuanDerived): ValuationDTO {
  return {
    fundCode: d.fd_code,
    source: 'danjuan',
    estimatedNav: Number(d.unit_nav),
    estimatedGrowthPct: Number(d.nav_grtd),
    estimatedAt: d.end_date,
    baseNav: Number(d.unit_nav),
    baseNavDate: d.end_date,
  };
}

export async function fetchDanjuanValuation(code: string): Promise<ValuationDTO> {
  const url = `https://danjuanfunds.com/djapi/fund/derived/${code}`;
  const resp = await fetchJson<DanjuanDerivedResp>(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!resp.data) {
    throw new UpstreamError(502, `蛋卷估值响应异常 (result_code=${resp.result_code})`);
  }
  return toValuationDTO(resp.data);
}

interface DanjuanHistItem {
  date: string;
  nav: string;
  percentage: string;
}
interface DanjuanHistResp {
  data?: { items?: DanjuanHistItem[]; total_pages?: number; current_page?: number };
  result_code?: number;
}

export function parseDanjuanHistory(items: DanjuanHistItem[]): NavPointDTO[] {
  return items
    .map((it) => ({
      date: it.date,
      nav: Number(it.nav),
      growthPct: it.percentage ? Number(it.percentage) : undefined,
    }))
    .filter((p) => p.date && Number.isFinite(p.nav))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** 蛋卷历史净值（备用历史源） */
export async function fetchDanjuanHistory(
  code: string,
  maxPages = 10,
): Promise<NavPointDTO[]> {
  const size = 200;
  const all: NavPointDTO[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const url = `https://danjuanfunds.com/djapi/fund/nav/history/${code}?size=${size}&page=${page}`;
    const resp = await fetchJson<DanjuanHistResp>(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const items = resp.data?.items ?? [];
    all.push(...parseDanjuanHistory(items));
    if (!resp.data?.total_pages || page >= resp.data.total_pages || items.length < size) break;
  }
  const map = new Map(all.map((p) => [p.date, p]));
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
