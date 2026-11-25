import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  LayoutGrid,
  Maximize2,
  RotateCcw,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react';
import { getGallery, resolveFileUrl } from '../api/client';
import { useAppData } from '../context/AppDataContext';
import { formatClassLabel } from '../utils/formatters';
import { PageTransition } from '../components/ui/PageTransition';
import { AxisChip, ClassChip } from '../components/ui/ClassChip';
import { BeforeAfterSlider } from '../components/ui/BeforeAfterSlider';
import { Lightbox } from '../components/ui/Lightbox';
import { SkeletonCardGrid } from '../components/ui/Skeleton';
import { StatePanel } from '../components/ui/StatePanel';

const PAGE_SIZE = 12;

export function GalleryPage() {
  const { classes, axes } = useAppData();

  const [selectedClass, setSelectedClass] = useState('');
  const [selectedAxis, setSelectedAxis] = useState('');
  const [keptFilter, setKeptFilter] = useState('all'); // 'all' | 'kept' | 'rejected'
  const [viewMode, setViewMode] = useState('slider'); // 'slider' | 'side-by-side'
  const [page, setPage] = useState(1);

  const [galleryData, setGalleryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [activeIdx, setActiveIdx] = useState(null);

  const loadGallery = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActiveIdx(null);
    try {
      const res = await getGallery({
        cls: selectedClass,
        axis: selectedAxis,
        page,
        pageSize: PAGE_SIZE,
      });
      setGalleryData(res);
    } catch (err) {
      setError(err?.message || 'Unable to load generative gallery.');
    } finally {
      setLoading(false);
    }
  }, [selectedClass, selectedAxis, page]);

  useEffect(() => {
    loadGallery();
  }, [loadGallery]);

  const handleClassFilter = (cls) => {
    setSelectedClass((prev) => (prev === cls ? '' : cls));
    setPage(1);
  };

  const handleAxisFilter = (axisId) => {
    setSelectedAxis((prev) => (prev === axisId ? '' : axisId));
    setPage(1);
  };

  const resetFilters = () => {
    setSelectedClass('');
    setSelectedAxis('');
    setKeptFilter('all');
    setPage(1);
  };

  const rawItems = galleryData?.items || [];
  const visibleItems = useMemo(() => {
    if (keptFilter === 'kept') return rawItems.filter((item) => item.kept);
    if (keptFilter === 'rejected') return rawItems.filter((item) => !item.kept);
    return rawItems;
  }, [rawItems, keptFilter]);

  const keptOnPage = useMemo(() => rawItems.filter((i) => i.kept).length, [rawItems]);
  const rejectedOnPage = rawItems.length - keptOnPage;

  const total = galleryData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const axisOptions =
    axes.length > 0
      ? axes
      : [
          { id: 'lighting', label: 'Lighting' },
          { id: 'contamination', label: 'Contamination' },
          { id: 'condition', label: 'Material condition' },
        ];

  const activeItem = activeIdx !== null && visibleItems[activeIdx] ? visibleItems[activeIdx] : null;

  return (
    <PageTransition className="space-y-6">
      {/* Filter Header */}
      <section className="sa-card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-alpine-700" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-ink">
              Generative Augmentation Archive
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Slider vs Side-by-Side View Switcher */}
            <div
              className="inline-flex items-center rounded-full border border-ink/12 bg-paper p-0.5"
              role="group"
              aria-label="Gallery comparison layout"
            >
              <button
                type="button"
                onClick={() => setViewMode('slider')}
                aria-pressed={viewMode === 'slider'}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === 'slider'
                    ? 'bg-alpine-600 text-surface shadow-sm'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
                Slider
              </button>
              <button
                type="button"
                onClick={() => setViewMode('side-by-side')}
                aria-pressed={viewMode === 'side-by-side'}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === 'side-by-side'
                    ? 'bg-alpine-600 text-surface shadow-sm'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <LayoutGrid className="h-3 w-3" aria-hidden="true" />
                Side-by-Side
              </button>
            </div>

            <span className="font-mono text-xs text-ink-subtle">
              {loading ? 'Loading…' : `${total} sample${total === 1 ? '' : 's'}`}
            </span>

            {(selectedClass || selectedAxis || keptFilter !== 'all') && (
              <button type="button" onClick={resetFilters} className="sa-btn-ghost text-xs">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Class filter chips */}
        <div className="space-y-2">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
            Material Class
          </span>
          <div className="flex flex-wrap gap-2">
            <motion.button
              layout
              type="button"
              onClick={() => {
                setSelectedClass('');
                setPage(1);
              }}
              aria-pressed={selectedClass === ''}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedClass === ''
                  ? 'border-alpine-600 bg-alpine-600 text-surface shadow-sm'
                  : 'border-ink/15 bg-paper text-ink-muted hover:border-alpine-300 hover:text-ink'
              }`}
            >
              All classes
            </motion.button>
            {classes.map((cls) => {
              const active = selectedClass === cls;
              return (
                <motion.button
                  key={cls}
                  layout
                  type="button"
                  onClick={() => handleClassFilter(cls)}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? 'border-alpine-600 bg-alpine-600 text-surface shadow-sm'
                      : 'border-ink/15 bg-paper text-ink-muted hover:border-alpine-300 hover:text-ink'
                  }`}
                >
                  {formatClassLabel(cls)}
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Axis + Quality Filter Row */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
              Variation Axis
            </span>
            <div className="flex flex-wrap gap-2">
              <motion.button
                layout
                type="button"
                onClick={() => {
                  setSelectedAxis('');
                  setPage(1);
                }}
                aria-pressed={selectedAxis === ''}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedAxis === ''
                    ? 'border-alpine-600 bg-alpine-600 text-surface shadow-sm'
                    : 'border-ink/15 bg-paper text-ink-muted hover:border-alpine-300 hover:text-ink'
                }`}
              >
                All axes
              </motion.button>
              {axisOptions.map((axis) => {
                const active = selectedAxis === axis.id;
                return (
                  <motion.button
                    key={axis.id}
                    layout
                    type="button"
                    onClick={() => handleAxisFilter(axis.id)}
                    aria-pressed={active}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? 'border-alpine-600 bg-alpine-600 text-surface shadow-sm'
                        : 'border-ink/15 bg-paper text-ink-muted hover:border-alpine-300 hover:text-ink'
                    }`}
                  >
                    {axis.label}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Client-side Quality Filter */}
          <div className="space-y-2">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
              Quality Filter (Current Page)
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setKeptFilter('all')}
                aria-pressed={keptFilter === 'all'}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  keptFilter === 'all'
                    ? 'border-alpine-600 bg-alpine-600 text-surface shadow-sm'
                    : 'border-ink/15 bg-paper text-ink-muted hover:text-ink'
                }`}
              >
                All ({rawItems.length})
              </button>
              <button
                type="button"
                onClick={() => setKeptFilter('kept')}
                aria-pressed={keptFilter === 'kept'}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  keptFilter === 'kept'
                    ? 'border-emeraldok-border bg-emeraldok-bg text-emeraldok-text shadow-sm'
                    : 'border-ink/15 bg-paper text-ink-muted hover:text-ink'
                }`}
              >
                Kept ({keptOnPage})
              </button>
              <button
                type="button"
                onClick={() => setKeptFilter('rejected')}
                aria-pressed={keptFilter === 'rejected'}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  keptFilter === 'rejected'
                    ? 'border-err-border bg-err-bg text-err-text shadow-sm'
                    : 'border-ink/15 bg-paper text-ink-muted hover:text-ink'
                }`}
              >
                Rejected ({rejectedOnPage})
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Gallery Grid */}
      {loading ? (
        <SkeletonCardGrid count={6} columnsClass="grid-cols-1 md:grid-cols-2 xl:grid-cols-3" />
      ) : error ? (
        <StatePanel
          variant="error"
          title="Could not load gallery"
          description={error}
          actionLabel="Retry"
          onAction={loadGallery}
        />
      ) : visibleItems.length === 0 ? (
        <StatePanel
          title="No generative samples match these filters"
          description="Try clearing the class, axis, or quality filter to inspect more samples."
          actionLabel="Clear filters"
          onAction={resetFilters}
        />
      ) : (
        <>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibleItems.map((item, idx) => {
              const beforeSrc = resolveFileUrl(item.original_url);
              const afterSrc = resolveFileUrl(item.generated_url);

              return (
                <motion.article
                  key={item.id}
                  layoutId={`gallery-card-${item.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -3 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  className="sa-card flex flex-col overflow-hidden transition-[border-color,box-shadow] hover:border-alpine-300/80 hover:shadow-elevated"
                >
                  <div className="p-3 pb-0">
                    {viewMode === 'slider' ? (
                      <BeforeAfterSlider
                        beforeSrc={beforeSrc}
                        afterSrc={afterSrc}
                        beforeLabel="Original"
                        afterLabel={item.mode || 'Generated'}
                        alt={`${item.class} ${item.axis}`}
                        allowZoom={false}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveIdx(idx)}
                        className="grid w-full grid-cols-2 gap-1.5 overflow-hidden rounded-control text-left"
                        aria-label={`Inspect ${item.id} before and after in lightbox`}
                      >
                        <div className="relative overflow-hidden rounded-lg border border-ink/10 bg-recessed">
                          <img
                            src={beforeSrc}
                            alt={`${item.class} original`}
                            className="aspect-[4/3] w-full object-cover"
                          />
                          <span className="absolute left-1.5 top-1.5 rounded bg-ink/80 px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase text-surface">
                            Orig
                          </span>
                        </div>
                        <div className="relative overflow-hidden rounded-lg border border-ink/10 bg-recessed">
                          <img
                            src={afterSrc}
                            alt={`${item.class} generated`}
                            className="aspect-[4/3] w-full object-cover"
                          />
                          <span className="absolute right-1.5 top-1.5 rounded bg-alpine-600/90 px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase text-surface">
                            {item.mode || 'Gen'}
                          </span>
                        </div>
                      </button>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col justify-between space-y-3 p-4">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <ClassChip label={item.class} size="xs" />
                          <AxisChip axis={item.axis} size="xs" />
                        </div>

                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                            item.kept
                              ? 'border-emeraldok-border bg-emeraldok-bg text-emeraldok-text'
                              : 'border-err-border bg-err-bg text-err-text'
                          }`}
                        >
                          {item.kept ? (
                            <>
                              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                              Kept
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3" aria-hidden="true" />
                              Rejected
                            </>
                          )}
                        </span>
                      </div>

                      <p className="line-clamp-2 text-xs leading-relaxed text-ink-muted">
                        {item.prompt}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-t border-ink/10 pt-3">
                      <div className="flex items-center gap-2 font-mono text-[11px] text-ink-subtle">
                        <span className="rounded bg-alpine-50 px-1.5 py-0.5 font-medium text-alpine-800">
                          {item.mode}
                        </span>
                        <span>strength {Number(item.strength).toFixed(2)}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActiveIdx(idx)}
                        className="inline-flex items-center gap-1 rounded-lg border border-ink/15 bg-surface px-2.5 py-1 text-xs font-medium text-ink transition-colors hover:border-alpine-300 hover:bg-alpine-50/70"
                      >
                        <Maximize2 className="h-3 w-3" aria-hidden="true" />
                        Inspect
                      </button>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>

          {/* Pagination */}
          <nav
            aria-label="Gallery pagination"
            className="sa-card flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
          >
            <p className="font-mono text-xs text-ink-subtle">
              Page <strong className="text-ink">{page}</strong> of{' '}
              <strong className="text-ink">{totalPages}</strong> · {total} total items
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="sa-btn-secondary px-3 py-1.5 text-xs"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="sa-btn-secondary px-3 py-1.5 text-xs"
              >
                Next
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </nav>
        </>
      )}

      {/* Shared-element Lightbox with Prev/Next Stepping */}
      <Lightbox
        open={Boolean(activeItem)}
        onClose={() => setActiveIdx(null)}
        layoutId={activeItem ? `gallery-card-${activeItem.id}` : undefined}
        title={activeItem ? `${formatClassLabel(activeItem.class)} · ${activeItem.id}` : ''}
        subtitle={
          activeItem
            ? `${activeItem.mode} · strength ${Number(activeItem.strength).toFixed(2)} · ${
                activeItem.kept ? 'Kept in training set' : 'Rejected by quality filter'
              }`
            : ''
        }
        beforeSrc={activeItem ? resolveFileUrl(activeItem.original_url) : null}
        afterSrc={activeItem ? resolveFileUrl(activeItem.generated_url) : null}
        beforeLabel="Original"
        afterLabel={activeItem?.mode || 'Generated'}
        currentIndex={activeIdx}
        totalCount={visibleItems.length}
        onPrev={
          visibleItems.length > 1
            ? () =>
                setActiveIdx((i) =>
                  i === null ? 0 : (i - 1 + visibleItems.length) % visibleItems.length
                )
            : null
        }
        onNext={
          visibleItems.length > 1
            ? () => setActiveIdx((i) => (i === null ? 0 : (i + 1) % visibleItems.length))
            : null
        }
        footer={
          activeItem ? (
            <div className="space-y-2 rounded-control border border-ink/10 bg-paper p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <ClassChip label={activeItem.class} size="xs" />
                <AxisChip axis={activeItem.axis} size="xs" />
                <span
                  className={`rounded-full border px-2 py-0.5 font-mono text-[11px] font-semibold ${
                    activeItem.kept
                      ? 'border-emeraldok-border bg-emeraldok-bg text-emeraldok-text'
                      : 'border-err-border bg-err-bg text-err-text'
                  }`}
                >
                  {activeItem.kept ? 'Kept' : 'Rejected'}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-ink">
                <span className="font-mono font-semibold text-ink-subtle">PROMPT: </span>
                {activeItem.prompt}
              </p>
            </div>
          ) : null
        }
      />
    </PageTransition>
  );
}