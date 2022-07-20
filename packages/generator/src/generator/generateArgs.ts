import path from 'path'
import { OptionalKind, Project, PropertyDeclarationStructure, Writers } from 'ts-morph'
import { DmmfDocument } from './dmmf/DmmfDocument'
import { DMMF } from './dmmf/types'
import { camelCase, getArguments, getInputTypeName } from './helpers'

export const generateArgs = (dmmfDocument: DmmfDocument, project: Project, outputDir: string, model: DMMF.Model) => {
  const modelName = camelCase(model.name)
  const writeLocation = path.join(outputDir, modelName, `${modelName}.args.ts`)
  const sourceFile = project.createSourceFile(writeLocation, undefined, {
    overwrite: true,
  })

  // imports
  sourceFile.addImportDeclaration({ moduleSpecifier: '@nestjs/graphql', namespaceImport: 'NestJsGraphQL' })
  const inputs: { [key: string]: string[] } = {}
  const commonEnums: string[] = []
  dmmfDocument.relationModels.forEach(async (relationModelData) => {
    relationModelData.relationFields
      .filter((field) => field.argsTypeName)
      .forEach(async (field) => {
        console.log(modelName, 'relationFields.typeGraphQLType:', field.outputTypeField.args)
        const fields = field.outputTypeField.args
        // import inputs
        for (const item of [
          ...new Set(
            fields
              .map((arg) => arg.selectedInputType)
              .filter((argInputType) => argInputType.location === 'inputObjectTypes')
              .map((argInputType) => argInputType.type),
          ),
        ].sort()) {
          const key = camelCase(dmmfDocument.schema.inputTypes.find((type) => type.typeName === item)?.modelName || '')
          if (!inputs[key]) inputs[key] = []
          if (!inputs[key].includes(item)) inputs[key].push(item)
        }
        // import enums
        for (const item of [
          ...new Set(
            fields
              .filter((field) => !field.typeName)
              .map((field) => field.selectedInputType)
              .filter((argType) => argType.location === 'enumTypes')
              .map((argType) => argType.type as string),
          ),
        ].sort()) {
          sourceFile.addImportDeclaration({
            moduleSpecifier: `../enums/${item}.enum`,
            namedImports: [item],
          })
        }
        // import commonEnums
        for (const item of [
          ...new Set(
            fields
              .filter((field) => field.typeName)
              .map((field) => field.selectedInputType)
              .filter((argType) => argType.location === 'enumTypes')
              .map((argType) => argType.type as string),
          ),
        ].sort()) {
          if (!commonEnums.includes(item)) commonEnums.push(item)
        }
      })
  })
  Object.entries(inputs).forEach(([key, val]) => {
    if (inputs[key].length) {
      sourceFile.addImportDeclaration({
        moduleSpecifier: `../${key}/${key}.input`,
        namedImports: val,
      })
    }
  })
  if (commonEnums.length) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: `../common/enums`,
      namedImports: commonEnums,
    })
  }

  dmmfDocument.relationModels
    .filter((field) => field.model.name === model.name)
    .forEach(async (relationModelData) => {
      relationModelData.relationFields
        .filter((field) => field.argsTypeName)
        .forEach(async (field) => {
          const fields = field.outputTypeField.args

          sourceFile.addClass({
            name: field.argsTypeName,
            isExported: true,
            decorators: [
              {
                name: 'NestJsGraphQL.ArgsType',
                arguments: [],
              },
            ],
            properties: fields.map<OptionalKind<PropertyDeclarationStructure>>((arg) => {
              return {
                name: arg.typeName,
                type: arg.fieldTSType,
                hasExclamationToken: arg.isRequired,
                hasQuestionToken: !arg.isRequired,
                trailingTrivia: '\r\n',
                decorators: [
                  {
                    name: 'NestJsGraphQL.Field',
                    arguments: getArguments(arg.typeGraphQLType, undefined, !arg.isRequired),
                  },
                ],
              }
            }),
          })
        })
    })
}