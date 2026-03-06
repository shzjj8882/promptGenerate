/**
 * 网格坐标系统 - 移植自 APITable Coordinate/GridCoordinate
 * 用于 Canvas 表格的虚拟化、点击检测、单元格定位
 * 参考: packages/datasheet/src/pc/components/konva_grid/model/coordinate/
 */

export type IndicesMap = Record<number, number>;

export type CellMetaData = {
  size: number;
  offset: number;
};

export type CellMetaDataMap = Record<number, CellMetaData>;

export enum ItemType {
  Row = "Row",
  Column = "Column",
}

export interface ICoordinate {
  rowCount: number;
  columnCount: number;
  containerWidth: number;
  containerHeight: number;
  rowHeight: number;
  columnWidth: number;
  rowIndicesMap?: IndicesMap;
  columnIndicesMap?: IndicesMap;
  /** 垂直方向初始偏移（如表头高度） */
  rowInitSize?: number;
  /** 水平方向初始偏移（如 ID 列宽度） */
  columnInitSize?: number;
}

export interface IGridCoordinate extends ICoordinate {
  frozenColumnCount?: number;
  autoHeadHeight?: boolean;
}

/**
 * Canvas 网格基础坐标系统
 * 支持固定/可变行高、列宽，用于虚拟化与点击检测
 */
export class Coordinate {
  protected _rowHeight: number;
  protected _columnWidth: number;
  public rowCount: number;
  public columnCount: number;
  public containerWidth: number;
  public containerHeight: number;
  public rowIndicesMap: IndicesMap = {};
  public columnIndicesMap: IndicesMap = {};
  public rowInitSize: number;
  public columnInitSize: number;
  public lastRowIndex = -1;
  public lastColumnIndex = -1;
  public rowMetaDataMap: CellMetaDataMap = {};
  public columnMetaDataMap: CellMetaDataMap = {};

  constructor({
    rowHeight,
    columnWidth,
    rowCount,
    columnCount,
    containerWidth,
    containerHeight,
    rowInitSize = 0,
    columnInitSize = 0,
    rowIndicesMap = {},
    columnIndicesMap = {},
  }: ICoordinate) {
    this._rowHeight = rowHeight;
    this._columnWidth = columnWidth;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
    this.rowInitSize = rowInitSize;
    this.columnInitSize = columnInitSize;
    this.containerWidth = containerWidth;
    this.containerHeight = containerHeight;
    this.rowIndicesMap = rowIndicesMap;
    this.columnIndicesMap = columnIndicesMap;
  }

  public get columnWidth() {
    return this._columnWidth;
  }

  public set columnWidth(width: number) {
    this._columnWidth = width;
  }

  public get rowHeight() {
    return this._rowHeight;
  }

  public set rowHeight(height: number) {
    this._rowHeight = height;
  }

  /** 总宽度 */
  public get totalWidth() {
    const { offset, size } = this.getCellMetaData(this.columnCount - 1, ItemType.Column);
    return offset + size;
  }

  /** 总高度 */
  public get totalHeight() {
    const { offset, size } = this.getCellMetaData(this.rowCount - 1, ItemType.Row);
    return offset + size;
  }

  public getRowHeight(index: number) {
    return this.rowMetaDataMap[index]?.size ?? this.rowHeight;
  }

  public getColumnWidth(index: number) {
    return this.columnMetaDataMap[index]?.size ?? this.columnWidth;
  }

  protected getCellMetaData(index: number, itemType: ItemType): CellMetaData {
    const isColumnType = itemType === ItemType.Column;
    const itemSize = isColumnType ? this.columnWidth : this.rowHeight;
    let offset = isColumnType ? this.columnInitSize : this.rowInitSize;
    const lastMeasuredIndex = isColumnType ? this.lastColumnIndex : this.lastRowIndex;
    const cellMetadataMap = isColumnType ? this.columnMetaDataMap : this.rowMetaDataMap;

    if (index > lastMeasuredIndex) {
      if (lastMeasuredIndex >= 0) {
        const itemMetadata = cellMetadataMap[lastMeasuredIndex];
        offset = itemMetadata.offset + itemMetadata.size;
      }
      for (let i = lastMeasuredIndex + 1; i <= index; i++) {
        const size =
          (isColumnType ? this.columnIndicesMap[i] : this.rowIndicesMap[i]) ?? itemSize;
        cellMetadataMap[i] = { offset, size };
        offset += size;
      }
      if (isColumnType) this.lastColumnIndex = index;
      else this.lastRowIndex = index;
    }
    return cellMetadataMap[index] || { size: 0, offset: 0 };
  }

  private findNearestCellIndexByBinary(
    offset: number,
    low: number,
    high: number,
    itemType: ItemType
  ): number {
    while (low <= high) {
      const middle = low + Math.floor((high - low) / 2);
      const currentOffset = this.getCellMetaData(middle, itemType).offset;
      if (currentOffset === offset) return middle;
      if (currentOffset < offset) low = middle + 1;
      else high = middle - 1;
    }
    return low > 0 ? low - 1 : 0;
  }

  private findNearestCellIndexFromIndex(index: number, offset: number, itemType: ItemType): number {
    const itemCount = itemType === ItemType.Column ? this.columnCount : this.rowCount;
    let interval = 1;
    while (
      index < itemCount &&
      this.getCellMetaData(index, itemType).offset < offset
    ) {
      index += interval;
      interval *= 2;
    }
    return this.findNearestCellIndexByBinary(
      offset,
      Math.floor(index / 2),
      Math.min(index, itemCount - 1),
      itemType
    );
  }

  public findNearestCellIndex(offset: number, itemType: ItemType): number {
    const itemMetadataMap =
      itemType === ItemType.Column ? this.columnMetaDataMap : this.rowMetaDataMap;
    const lastIndex =
      itemType === ItemType.Column ? this.lastColumnIndex : this.lastRowIndex;
    const lastMeasuredItemOffset = lastIndex > 0 ? itemMetadataMap[lastIndex].offset : 0;
    if (lastMeasuredItemOffset >= offset) {
      return this.findNearestCellIndexByBinary(offset, 0, lastIndex, itemType);
    }
    return this.findNearestCellIndexFromIndex(Math.max(0, lastIndex), offset, itemType);
  }

  /** 根据垂直偏移获取起始行索引 */
  public getRowStartIndex(offset: number) {
    return this.findNearestCellIndex(offset, ItemType.Row);
  }

  /** 根据起始行和 scrollTop 获取结束行索引 */
  public getRowStopIndex(startIndex: number, scrollTop: number) {
    const itemMetadata = this.getCellMetaData(startIndex, ItemType.Row);
    const maxOffset = scrollTop + this.containerHeight;
    let offset = itemMetadata.offset + itemMetadata.size;
    let stopIndex = startIndex;
    while (stopIndex < this.rowCount - 1 && offset < maxOffset) {
      stopIndex++;
      offset += this.getCellMetaData(stopIndex, ItemType.Row).size;
    }
    return stopIndex;
  }

  /** 根据水平偏移获取起始列索引 */
  public getColumnStartIndex(offset: number) {
    return this.findNearestCellIndex(offset, ItemType.Column);
  }

  /** 根据起始列和 scrollLeft 获取结束列索引 */
  public getColumnStopIndex(startIndex: number, scrollLeft: number) {
    const itemMetadata = this.getCellMetaData(startIndex, ItemType.Column);
    const maxOffset = scrollLeft + this.containerWidth;
    let offset = itemMetadata.offset + itemMetadata.size;
    let stopIndex = startIndex;
    while (stopIndex < this.columnCount - 1 && offset < maxOffset) {
      stopIndex++;
      offset += this.getCellMetaData(stopIndex, ItemType.Column).size;
    }
    return stopIndex;
  }

  /** 根据 rowIndex 获取垂直偏移 */
  public getRowOffset(rowIndex: number) {
    return this.getCellMetaData(rowIndex, ItemType.Row).offset;
  }

  /** 根据 columnIndex 获取水平偏移 */
  public getColumnOffset(columnIndex: number) {
    return this.getCellMetaData(columnIndex, ItemType.Column).offset;
  }
}

/**
 * 网格坐标系统（支持冻结列等扩展）
 */
export class GridCoordinate extends Coordinate {
  public frozenColumnCount: number;
  public autoHeadHeight: boolean;

  constructor({ frozenColumnCount = 0, autoHeadHeight = false, ...rest }: IGridCoordinate) {
    super(rest);
    this.autoHeadHeight = autoHeadHeight;
    this.frozenColumnCount = frozenColumnCount;
  }

  get frozenColumnWidth() {
    return this.getColumnOffset(this.frozenColumnCount) - this.columnInitSize;
  }

  public getCellRect(rowIndex: number, columnIndex: number) {
    const { size: height, offset: y } = this.getCellMetaData(rowIndex, ItemType.Row);
    const { size: width, offset: x } = this.getCellMetaData(columnIndex, ItemType.Column);
    return { x, y, width, height };
  }
}
