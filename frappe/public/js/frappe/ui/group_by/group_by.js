frappe.provide("frappe.views");

frappe.ui.GroupBy = class {
	constructor(report_view) {
		this.report_view = report_view;
		this.page = report_view.page;
		this.doctype = report_view.doctype;
		this.make();
	}

	make() {
		this.make_group_by_button();
		this.init_group_by_popover();
		this.set_popover_events();
	}

	init_group_by_popover() {
		this.sql_aggregate_functions = [
			{ name: "count", label: __("Count") },
			{ name: "sum", label: __("Sum") },
			{ name: "avg", label: __("Average") },
			{ name: "min", label: __("Minimum") },
			{ name: "max", label: __("Maximum") },
		];

		this.group_by_popover = $(frappe.render_template("group_by_area"));
		this.new_group_by_field = frappe.render_template("group_by");
		this.new_aggregate_column_field = frappe.render_template("aggregate_column", {
			aggregate_function_conditions: this.sql_aggregate_functions,
		});

		this.group_by_popover.find(".group-by-fields.form-group").html(this.new_group_by_field);

		this.group_by_popover
			.find(".aggregate-fields.form-group")
			.html(this.new_aggregate_column_field);

		this.group_by_button.popover({
			content: this.group_by_popover,
			template: `
				<div class="group-by-popover popover">
					<div class="arrow"></div>
					<div class="popover-body popover-content">
					</div>
				</div>
			`,
			html: true,
			trigger: "manual",
			container: "body",
			placement: "bottom",
			offset: "-100px, 0",
		});
	}

	set_popover_events() {
		$(document.body).on("click", (e) => {
			if (this.wrapper && this.wrapper.is(":visible")) {
				if (
					$(e.target).parents(".group-by-popover").length === 0 &&
					$(e.target).parents(".group-by-box").length === 0 &&
					$(e.target).parents(".group-by-button").length === 0 &&
					!$(e.target).is(this.group_by_button)
				) {
					this.wrapper && this.hide_popover();
				}
			}
		});

		this.group_by_button.on("click", () => {
			this.group_by_button.popover("toggle");
		});

		this.group_by_button.on("shown.bs.popover", () => {
			if (!this.wrapper) {
				this.wrapper = $(".group-by-popover");
				this.setup_group_by_area();
			}
			if (!this.group_by_field_list?.length) {
				this.add_group_by_field();
			}
			if (!this.aggregate_on_field_list?.length) {
				this.add_aggregate_column_field();
			}
		});

		this.group_by_button.on("hidden.bs.popover", () => {
			this.clear_empty_fields();
			this.update_group_by_button();
		});

		frappe.router.on("change", () => {
			this.hide_popover();
		});
	}

	hide_popover() {
		this.group_by_button.popover("hide");
	}

	setup_group_by_area() {
		this.group_by_field_list = this.group_by_field_list ?? [];
		this.aggregate_on_field_list = this.aggregate_on_field_list ?? [];

		this.group_by = this.group_by ?? [];
		this.group_by_aggregate_fields = this.group_by_aggregate_fields ?? [];

		this.group_by_box = this.wrapper.find(".group-by-box");
		this.group_by_box.find(".group-by-fields").html("");
		this.group_by_box.find(".aggregate-fields").html("");

		this.group_by.forEach((data) => {
			this.add_group_by_field(data.group_by_doctype, data.group_by_field);
		});
		this.group_by_aggregate_fields.forEach((data) => {
			this.add_aggregate_column_field(
				data.aggregate_function,
				data.aggregate_on_doctype,
				data.aggregate_on_field
			);
		});

		this.set_group_by_events();
	}

	set_group_by_events() {
		this.group_by_box.on("change", "select.aggregate-function", (e) => {
			const field = $(e.target).data("aggregate-field");
			field.awesomeplete_list = [];
			field.options = [];
			field.fields_by_name = {};
			field.build_options();
			field.awesomplete._list = field.options;

			// to remove unrelated value for that aggregate function
			if (field.$input.val()) {
				field.set_value(field.selected_doctype, field.selected_fieldname);
			} else {
				field.set_value();
			}
			this.apply_group_by_and_refresh();
		});

		this.group_by_box.on("click", "button.add-group-by", (e) => {
			this.add_group_by_field();
		});

		this.group_by_box.on("click", "button.add-aggregate-column", (e) => {
			this.add_aggregate_column_field();
		});

		this.group_by_box.on("click", ".remove-group-by", (e) => {
			this.group_by_field_list = this.group_by_field_list.reduce((res, f) => {
				if (!f.parent.closest(".group-by-row").is($(e.target).closest(".group-by-row"))) {
					res.push(f);
				}
				return res;
			}, []);

			$(e.target).closest(".group-by-row").remove();
			this.apply_group_by_and_refresh();
			e.stopPropagation();
		});

		this.group_by_box.on("click", ".remove-aggregate-column", (e) => {
			this.aggregate_on_field_list = this.aggregate_on_field_list.reduce((res, f) => {
				if (
					!f.parent.closest(".aggregate-row").is($(e.target).closest(".aggregate-row"))
				) {
					res.push(f);
				}
				return res;
			}, []);

			$(e.target).closest(".aggregate-row").remove();
			this.apply_group_by_and_refresh();
			e.stopPropagation();
		});

		this.group_by_box.on("click", ".apply-group-by", (e) => {
			this.apply_group_by_and_refresh();
			this.hide_popover();
		});

		this.group_by_box.on("click", ".remove-all-group-by", (e) => {
			this.remove_group_by();
			this.hide_popover();
		});
	}

	add_group_by_field(doctype, fieldname) {
		const new_field = $(this.new_group_by_field);
		this.group_by_box.find(".group-by-fields").append(new_field);

		const fieldselect = new frappe.ui.FieldSelect({
			parent: new_field.find(".group-by-field-container"),
			doctype: this.doctype,
			parent_doctype: this.doctype,
			input_class: "input-xs",
			select: () => {
				this.apply_group_by_and_refresh();
			},
		});

		if (doctype && fieldname) {
			fieldselect.set_value(doctype, fieldname);
		} else {
			fieldselect.set_value();
		}

		this.group_by_field_list.push(fieldselect);
	}

	add_aggregate_column_field(func, doctype, fieldname) {
		const new_field = $(this.new_aggregate_column_field);
		if (func) {
			new_field.find("select.aggregate-function").val(func);
		}
		this.group_by_box.find(".aggregate-fields").append(new_field);

		const aggr_field_fieldselect = new frappe.ui.FieldSelect({
			parent: new_field.find(".aggregate-on-field-container"),
			doctype: this.doctype,
			parent_doctype: this.doctype,
			filter_fields: (df, me) => {
				let fn = me.parent
					.closest(".aggregate-row")
					.find("select.aggregate-function")
					.val();

				if (["sum", "avg", "min", "max"].includes(fn)) {
					return frappe.model.is_numeric_field(df);
				}
				return true;
			},
			input_class: "input-xs",
			select: () => {
				this.apply_group_by_and_refresh();
			},
		});

		new_field
			.find("select.aggregate-function")
			.data("aggregate-field", aggr_field_fieldselect);

		if (doctype && fieldname) {
			aggr_field_fieldselect.set_value(doctype, fieldname);
		} else {
			aggr_field_fieldselect.set_value();
		}

		this.aggregate_on_field_list.push(aggr_field_fieldselect);
	}

	get_settings() {
		if (this.group_by?.length) {
			return {
				group_by: this.group_by,
				aggregate_columns: this.group_by_aggregate_fields,
				order_by: {
					doctype: this.report_view.sort_selector.doctype,
					sort_by: this.report_view.sort_selector.sort_by,
					sort_order: this.report_view.sort_selector.sort_order,
				},
			};
		} else {
			return null;
		}
	}

	apply_settings(settings) {
		this.group_by = settings.group_by;
		this.group_by_aggregate_fields = settings.aggregate_columns;

		if (settings.order_by) {
			this.report_view.sort_selector.set_value(
				settings.order_by.sort_by,
				settings.order_by.sort_order
			);
		}

		this.update_group_by_button();
	}

	make_group_by_button() {
		this.page.wrapper.find(".sort-selector").before(
			$(`<div class="group-by-selector">
				<button class="btn btn-default btn-sm group-by-button ellipsis">
					<span class="group-by-icon button-icon">
						${frappe.utils.icon("es-line-folder-alt")}
					</span>
					<span class="button-label hidden-xs">
						${__("Add Group")}
					</span>
				</button>
			</div>`)
		);

		this.group_by_button = this.page.wrapper.find(".group-by-button");
	}

	apply_group_by() {
		this.group_by = []; // group by fields
		this.group_by_aggregate_fields = []; // aggregate fields

		for (let idx = 0; idx < this.group_by_field_list.length; idx++) {
			const group_by_select = this.group_by_field_list[idx];
			if (group_by_select.$input.val() && group_by_select.get_value()) {
				this.group_by.push({
					group_by_doctype: group_by_select.selected_doctype,
					group_by_field: group_by_select.selected_fieldname,
				});
			}
		}

		for (let idx = 0; idx < this.aggregate_on_field_list.length; idx++) {
			const aggregate_on_select = this.aggregate_on_field_list[idx];
			const aggregate_function = this.aggregate_on_field_list[idx].parent
				.closest(".aggregate-row")
				.find("select.aggregate-function");

			if (
				aggregate_on_select.$input.val() &&
				aggregate_on_select.get_value() &&
				aggregate_function.val()
			) {
				this.group_by_aggregate_fields.push({
					aggregate_on_doctype: aggregate_on_select.selected_doctype,
					aggregate_on_field: aggregate_on_select.selected_fieldname,
					aggregate_function: aggregate_function.val(),
				});
			}
		}
	}

	apply_group_by_and_refresh() {
		this.apply_group_by();
		this.report_view.refresh();
	}

	set_args(args) {
		if (this.group_by?.length) {
			if (!this.group_by_aggregate_fields) {
				this.group_by_aggregate_fields = [];
			}

			// save original fields
			if (!this.original_fields) {
				this.original_fields = this.report_view.fields.map((f) => f);
			}

			this.report_view.fields = [];

			this.group_by.forEach((data) => {
				let { group_by_doctype, group_by_field } = data;
				this.report_view.fields.push([group_by_field, group_by_doctype]);
			});

			let order_by_doctype = this.report_view.sort_selector.doctype;
			let order_by_field = this.report_view.sort_selector.sort_by;

			// this.report_view.fields = [[this.group_by_field, this.group_by_doctype]];
			let group_by_aggregate_fields_name = [];
			this.group_by_aggregate_fields.forEach((data) => {
				let { aggregate_on_doctype, aggregate_on_field, aggregate_function } = data;
				group_by_aggregate_fields_name.push(
					[aggregate_on_field, aggregate_on_doctype, aggregate_function].join(":")
				);

				// Report View Fields
				const fieldMatch = this.report_view.fields.find(
					(field) =>
						field[0] === aggregate_on_field &&
						field[1] === aggregate_on_doctype &&
						field[2] === aggregate_function
				);
				if (!fieldMatch) {
					this.report_view.fields.push([
						aggregate_on_field,
						aggregate_on_doctype,
						aggregate_function,
					]);
				}

				// Order By - replace with aggregate column
				if (
					order_by_doctype === aggregate_on_doctype &&
					order_by_field === aggregate_on_field
				) {
					args.order_by = args.order_by.replace(
						"`tab" + order_by_doctype + "`." + order_by_field,
						`${aggregate_function}(` +
							"`" +
							`tab${aggregate_on_doctype}` +
							"`" +
							`.${aggregate_on_field})`
					);
				}
			});

			this.report_view.fields = this.report_view.fields.reduce((fields, field) => {
				if (!field[2]) {
					fields.push(field);
				} else if (
					group_by_aggregate_fields_name.includes(Object.values(field).join(":"))
				) {
					fields.push(field);
				}
				return fields;
			}, []);

			// // rebuild fields for group by
			args.fields = this.get_fields();
			// setup columns in datatable
			this.report_view.setup_columns();

			Object.assign(args, {
				with_comment_count: false,
				aggregate_columns: this.group_by_aggregate_fields,
				group_by: this.group_by,
			});
		}
	}

	get_fields() {
		let fields = this.report_view.fields
			.map((f) => {
				if (f[2]) {
					return;
				}
				let column_name = frappe.model.get_full_column_name(f[0], f[1]);
				if (f[1] !== this.doctype) {
					// child table field or aggregate field
					column_name = column_name + " as " + `'${[...f].reverse().join(":")}'`;
				}
				return column_name;
			})
			.filter(Boolean);

		const cdt_name_fields = this.report_view
			.get_unique_cdt_in_view()
			.map(
				(cdt) => frappe.model.get_full_column_name("name", cdt) + " as " + `'${cdt}:name'`
			);
		fields = fields.concat(cdt_name_fields);

		return fields;
	}

	get_group_by_docfield(column) {
		// called from build_column
		let [fieldname, doctype, aggregate_function] = column;

		let docfield;
		if (frappe.model.std_fields.find((df) => df.fieldname === fieldname)) {
			docfield = Object.assign(
				{},
				frappe.model.std_fields.find((df) => df.fieldname === fieldname)
			);
		} else {
			docfield = Object.assign({}, frappe.meta.docfield_map[doctype][fieldname]);
		}

		if (aggregate_function === "count") {
			docfield = Object.assign(docfield, {
				fieldtype: "Int",
				label: __("Count of {0}", [__(docfield.label, null, doctype)]),
				parent: doctype,
				width: 200,
			});
		} else {
			docfield.label = __("{0} of {1}", [
				this.sql_aggregate_functions.find((r) => r.name === aggregate_function)?.label,
				__(docfield.label, null, docfield.parent),
			]);

			if (aggregate_function === "avg" && docfield.fieldtype == "Int") {
				docfield.fieldtype = "Float"; // average of ints can be a float
			}
		}

		docfield.fieldname = `${[...column].reverse().join(":")}`;
		return docfield;
	}

	clear_empty_fields() {
		if (!this.wrapper) {
			return;
		}

		if (!this.group_by?.length) {
			this.remove_group_by();
		} else {
			this.group_by_field_list =
				this.group_by_field_list?.reduce((list, field) => {
					if (!field.$input.val() || !field.get_value()) {
						field.parent.closest(".group-by-row").remove();
					} else {
						list.push(field);
					}
					return list;
				}, []) || [];

			this.aggregate_on_field_list =
				this.aggregate_on_field_list?.reduce((list, field) => {
					if (
						!field.$input.val() ||
						!field.get_value() ||
						!field.parent
							.closest(".aggregate-row")
							.find("select.aggregate-function")
							.val()
					) {
						field.parent.closest(".aggregate-row").remove();
					} else {
						list.push(field);
					}
					return list;
				}, []) || [];
		}
	}

	remove_group_by() {
		if (this.group_by_field_list.length === 1) {
			this.group_by_field_list[0].set_value();
		} else {
			this.group_by_field_list = [];
			this.group_by_box.find(".group-by-fields").html("");
		}

		if (this.aggregate_on_field_list.length === 1) {
			this.aggregate_on_field_list[0].set_value();
			this.aggregate_on_field_list[0].parent
				.closest(".aggregate-row")
				.find("select.aggregate-function")
				.val("");
		} else {
			this.aggregate_on_field_list = [];
			this.group_by_box.find(".aggregate-fields").html("");
		}

		if (
			!this.group_by.length &&
			!this.group_by_aggregate_fields.length &&
			!this.original_fields?.length &&
			this.group_by_field_list.length === 1 &&
			this.aggregate_on_field_list.length === 1
		) {
			return;
		}

		this.group_by = [];
		this.group_by_aggregate_fields = [];

		// restore original fields
		if (this.original_fields) {
			this.report_view.fields = this.original_fields;
		} else {
			this.report_view.set_default_fields();
		}

		this.report_view.setup_columns();
		this.original_fields = null;
		this.report_view.refresh();
	}

	update_group_by_button() {
		const group_by_applied = Boolean(this.group_by?.length);
		const button_label = group_by_applied ? __("Grouped by Applied") : __("Add Group");

		this.group_by_button
			.toggleClass("btn-default", !group_by_applied)
			.toggleClass("btn-primary-light", group_by_applied);

		this.group_by_button.find(".group-by-icon").toggleClass("active", group_by_applied);

		this.group_by_button.find(".button-label").html(button_label);
		this.group_by_button.attr("title", `${this.group_by?.length || 0} Groups applied`);
	}
};
