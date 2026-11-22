import { StyleSheet } from 'react-native';

import { BrandColors } from '@/constants/theme';

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BrandColors.pageBackground,
  },
  scroll: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: 16,
    gap: 14,
  },
  heroCard: {
    backgroundColor: BrandColors.ink,
    borderRadius: 24,
    padding: 18,
    gap: 12,
    overflow: 'hidden',
  },
  heroTop: {
    gap: 4,
  },
  eyebrow: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  identityName: {
    color: BrandColors.paper,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  summaryPillText: {
    color: BrandColors.paper,
    fontSize: 12,
    fontWeight: '800',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: BrandColors.paper,
    borderWidth: 1,
    borderColor: BrandColors.line,
  },
  filterChipActive: {
    backgroundColor: BrandColors.ink,
    borderColor: BrandColors.ink,
  },
  filterText: {
    color: BrandColors.muted,
    fontSize: 12.5,
    fontWeight: '700',
  },
  filterTextActive: {
    color: BrandColors.paper,
    fontWeight: '800',
  },
  section: {
    gap: 10,
  },
  sessionCard: {
    backgroundColor: BrandColors.paper,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BrandColors.line,
    padding: 16,
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  sessionCardOpen: {
    borderWidth: 1.5,
    borderColor: BrandColors.ink,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  classBadge: {
    backgroundColor: BrandColors.soft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: '62%',
  },
  classText: {
    color: BrandColors.ink,
    fontSize: 11,
    fontWeight: '800',
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  cardTitle: {
    color: BrandColors.ink,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  details: {
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  detailValue: {
    color: BrandColors.muted,
    fontSize: 13,
    lineHeight: 19,
    flexShrink: 1,
  },
  actionButton: {
    marginTop: 4,
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: BrandColors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  actionButtonText: {
    color: BrandColors.paper,
    fontSize: 13,
    fontWeight: '800',
  },
  emptyState: {
    backgroundColor: BrandColors.paper,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: BrandColors.line,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  description: {
    color: BrandColors.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.78,
  },
});
